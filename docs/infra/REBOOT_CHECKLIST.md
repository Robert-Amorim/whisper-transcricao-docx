# Reboot Checklist

Checklist operacional para validar o servidor depois de reboot planejado ou apos manutencao de runtime.

## Objetivo

Confirmar que `nginx`, `pm2`, `api`, `worker`, certificados e fila voltaram corretamente sem regressao visivel.

## Ordem de verificacao

1. Sistema base
2. PM2 e processos
3. NGINX e listeners
4. Saude publica da aplicacao
5. Redis e fila
6. Fluxo minimo funcional

## 1. Sistema base

```bash
uptime
systemctl is-active nginx
systemctl is-active pm2-ubuntu
```

Esperado:

- `nginx` = `active`
- `pm2-ubuntu` = `active`

## 2. PM2 e processos

```bash
pm2 list
pm2 save
```

Esperado:

- `transcribe-api` online
- `transcribe-worker` online
- `transcribe-web` nao deve voltar ao PM2 em producao

## 3. NGINX e listeners

```bash
sudo nginx -t
ss -ltnp | rg '62011|62012|:80 |:443 '
```

Esperado:

- config do nginx valida
- API ouvindo em `62011`
- `62012` nao deve estar ouvindo em producao
- trafego publico via LB/NGINX em `80/443`

## 4. Saude publica da aplicacao

```bash
curl -skI https://voxora.integraretech.com.br/
curl -skI https://voxora.integraretech.com.br/health
```

Esperado:

- `/` -> `200`
- `/health` -> `200`

Validacao do certificado:

```bash
echo | openssl s_client -servername voxora.integraretech.com.br -connect voxora.integraretech.com.br:443 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName
```

Esperado:

- certificado SAN atual cobrindo `agora7app`, `api`, `admin` e `voxora`

## 5. Redis e fila

```bash
redis-cli -h 127.0.0.1 -p 6379 ping
redis-cli -h 127.0.0.1 -p 6379 --scan --pattern 'bull:transcriptions*' | sed -n '1,40p'
```

Esperado:

- `PONG`
- chaves da fila presentes

Contagem basica:

```bash
for k in wait active completed failed delayed paused prioritized; do \
  t=$(redis-cli -h 127.0.0.1 -p 6379 TYPE bull:transcriptions:$k 2>/dev/null | tail -n 1); \
  case "$t" in \
    list) c=$(redis-cli -h 127.0.0.1 -p 6379 LLEN bull:transcriptions:$k);; \
    zset) c=$(redis-cli -h 127.0.0.1 -p 6379 ZCARD bull:transcriptions:$k);; \
    none) c=0;; \
    *) c=n/a;; \
  esac; \
  echo "$k type=$t count=$c"; \
 done
```

## 6. Fluxo minimo funcional

Validar:

1. login na interface
2. upload/presign funcionando
3. novo job entrando na fila
4. worker processando ate `completed`
5. download de artefato funcionando

Smoke automatizado:

```bash
./scripts/ops/post-reboot-smoke.sh
RUN_E2E=1 ./scripts/ops/post-reboot-smoke.sh
```

## Sinais de alerta

- `pm2-ubuntu` falha ou fica `inactive`
- `transcribe-web` reaparece no PM2
- `62012` volta a ouvir em producao
- `/health` publico falha
- fila acumula em `wait` ou `active`
- worker registra falhas repetidas para novos jobs

## Acao rapida em incidente

1. validar `pm2 list`
2. validar `systemctl status pm2-ubuntu`
3. validar `sudo nginx -t`
4. validar `curl https://voxora.integraretech.com.br/health`
5. consultar logs:

```bash
pm2 logs transcribe-api --lines 100 --nostream
pm2 logs transcribe-worker --lines 100 --nostream
```

## Referencias

- `docs/infra/OCI_MULTIAPP_LB_RUNBOOK.md`
- `docs/infra/REDIS_UPGRADE_RUNBOOK.md`
- `docs/release/ROLLBACK_PLAN.md`
