# Redis Upgrade Runbook

Runbook para subir o Redis deste servidor de `6.0.16` para uma versao `6.2+` com janela controlada e rollback simples.

## Estado atual

- SO: Ubuntu `22.04.5 LTS`
- Redis atual: `6.0.16`
- Porta: `6379`
- Uso atual: fila BullMQ da Voxora
- Motivacao: BullMQ recomenda no minimo Redis `6.2`

## Decisao recomendada

Para esta maquina, o caminho mais sustentavel e migrar para o repositorio oficial da Redis e instalar Redis `7.x`.

Motivos:

- o Ubuntu `22.04` hoje entrega `6.0.16` como candidato padrao;
- Redis `7.x` cobre com folga a recomendacao minima do BullMQ;
- simplifica manutencao futura em vez de parar em `6.2` manualmente.

## Janela de manutencao

Fazer com janela curta, porque a fila e as APIs dependem do Redis.

Impacto esperado:

- indisponibilidade breve de enfileiramento;
- worker reconecta apos restart;
- API pode falhar ao operar fila durante a troca.

## Preflight

Rodar antes:

```bash
./scripts/ops/redis-preflight.sh
pm2 list
curl -skI https://voxora.integraretech.com.br/health
```

Confirmar:

- `transcribe-api` e `transcribe-worker` online;
- `wait` e `active` baixos ou zerados;
- sem processamento critico em andamento.

## Backup e snapshot

```bash
redis-cli BGSAVE
redis-cli LASTSAVE
sudo cp /var/lib/redis/dump.rdb /var/lib/redis/dump.rdb.bak-$(date +%F-%H%M%S)
sudo cp /etc/redis/redis.conf /etc/redis/redis.conf.bak-$(date +%F-%H%M%S)
```

Se `appendonly yes` estiver habilitado, copiar tambem os arquivos AOF do diretorio configurado em `CONFIG GET`.

## Upgrade sugerido

Adicionar o repositorio oficial:

```bash
sudo apt-get update
sudo apt-get install -y curl gpg
curl -fsSL https://packages.redis.io/gpg | sudo gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb jammy main" | \
  sudo tee /etc/apt/sources.list.d/redis.list
sudo apt-get update
apt-cache policy redis-server | sed -n '1,20p'
```

Instalar:

```bash
sudo systemctl stop redis-server
sudo apt-get install -y redis-server
sudo systemctl start redis-server
sudo systemctl status redis-server --no-pager
redis-server --version
redis-cli ping
```

## Validacao pos-upgrade

```bash
redis-cli INFO server | sed -n '1,20p'
pm2 restart transcribe-api --update-env
pm2 restart transcribe-worker --update-env
pm2 save
./scripts/ops/post-reboot-smoke.sh
RUN_E2E=1 ./scripts/ops/post-reboot-smoke.sh
```

Esperado:

- Redis `6.2+`, preferencialmente `7.x`
- `PONG`
- API e worker online
- `health` publico `200`
- E2E de upload -> fila -> processamento -> download concluindo

## Rollback

Se o novo Redis falhar:

```bash
sudo systemctl stop redis-server
sudo apt-get install -y redis-server=5:6.0.16-1ubuntu1.1
sudo cp /var/lib/redis/dump.rdb.bak-<timestamp> /var/lib/redis/dump.rdb
sudo cp /etc/redis/redis.conf.bak-<timestamp> /etc/redis/redis.conf
sudo systemctl start redis-server
redis-cli ping
pm2 restart transcribe-api --update-env
pm2 restart transcribe-worker --update-env
pm2 save
```

## Observacoes

- nao execute upgrade de Redis durante processamento ativo de jobs;
- o smoke E2E deve ser a validacao final, nao apenas `PING`;
- se a fila crescer com novas apps, considerar Redis dedicado para workloads assicronos.
