# OCI Multi-App Load Balancer Runbook

Este runbook padroniza como publicar varias aplicacoes HTTP/HTTPS no mesmo OCI Load Balancer usando subdominios, backend sets dedicados e NGINX na VM.

## Arquitetura padrao

```text
Internet
  -> DNS (subdominio por app)
  -> OCI Load Balancer / WAF
  -> Hostname virtual + listener 80/443
  -> Backend set da app
  -> NGINX na VM
  -> web estatico + API/worker da app
```

Exemplo:

- `agora7app.integraretech.com.br`
- `voxora.integraretech.com.br`

Ambos apontam para o mesmo IP publico do OCI Load Balancer.

## Padrao por aplicacao

Para cada aplicacao, criar:

1. Um subdominio DNS.
2. Um `hostname` virtual no OCI LB.
3. Um `backend set` dedicado.
4. Um listener HTTP `80` associado ao hostname.
5. Um listener HTTPS `443` associado ao hostname.
6. Um site NGINX na VM com `server_name` da app.
7. Um processo local da app em porta propria.

## Estrategia de certificados

### Modo recomendado para varias apps do mesmo dominio

Usar wildcard no OCI Load Balancer, respeitando a profundidade real dos hosts usados.

No cenario atual, o formato recomendado e:

- `*.integraretech.com.br`
- `*.agora7app.integraretech.com.br`

Isso cobre:

- `voxora.integraretech.com.br`
- `agora7app.integraretech.com.br`
- `admin.agora7app.integraretech.com.br`
- `api.agora7app.integraretech.com.br`

Vantagens:

- um certificado atende varias apps;
- o mesmo certificado pode ser associado a varios listeners HTTPS;
- onboarding de nova app fica mais rapido.

Observacoes:

- wildcard com Let's Encrypt exige desafio DNS-01;
- `*.integraretech.com.br` nao cobre `admin.agora7app.integraretech.com.br` nem `api.agora7app.integraretech.com.br`;
- se o DNS ficar fora da OCI, a emissao/renovacao precisa de integracao com o provedor DNS ou de etapa manual.

### Modo operacional imediato

Usar um certificado SAN multi-host no OCI Load Balancer.

Exemplos:

- `agora7app.integraretech.com.br`
- `api.agora7app.integraretech.com.br`
- `admin.agora7app.integraretech.com.br`
- `voxora.integraretech.com.br`

Esse modo funciona bem agora e pode ser migrado depois para wildcard.

### Estado atual em producao

No ambiente atual, o listener HTTPS compartilhado do OCI LB usa um certificado SAN chamado:

- `integraretech-multiapp-2026-06`

Esse certificado cobre:

- `agora7app.integraretech.com.br`
- `api.agora7app.integraretech.com.br`
- `admin.agora7app.integraretech.com.br`
- `voxora.integraretech.com.br`

Esse e o estado seguro atual. A migracao recomendada daqui para frente e sair do SAN manual para wildcard duplo.

## Padrao de nomes no OCI

Sugestao:

- Hostname: `hn-voxora`
- Backend set: `bs-voxora`
- Listener HTTP: `ls-http-voxora`
- Listener HTTPS: `ls-https-voxora`
- Certificado: `cert-voxora-prod`

Repita o mesmo padrao para cada app.

## Passo a passo para nova app

### 1. DNS

Criar `A record` do subdominio apontando para o IP publico do OCI LB.

Exemplo:

- `voxora.integraretech.com.br -> 147.15.35.30`

### 2. OCI Load Balancer

Criar ou reutilizar:

- hostname virtual da app;
- backend set da app;
- listener `80` com o hostname da app;
- listener `443` com o hostname da app;
- certificado correspondente no listener `443`.

Se existir WAF com regras por host, incluir o subdominio novo.

### 3. NGINX da VM

Gerar um site por app usando os templates em `infra/templates/`.

Parametros minimos:

- `server_name`: subdominio da app
- `web_root`: diretorio do frontend publicado
- `api_upstream`: `127.0.0.1:<porta-da-api>`
- `snippet_path`: snippet de locations da app

### 4. Aplicacao na VM

Publicar:

- frontend estatico em um diretorio proprio em `/var/www/<app>`;
- API em porta local propria;
- worker como processo separado, quando houver.

Padrao sugerido de portas:

- Agora7 API: `62001`
- Voxora API: `62011`
- Proxima app API: `62021`

### 5. Certificado

Se o listener usar certificado proprio da app:

1. emitir o certificado na VM;
2. exportar para `.secrets/oci-lb/<hostname>/`;
3. importar no OCI LB;
4. associar ao listener HTTPS da app.

Script util:

```bash
./scripts/ops/export-oci-lb-cert.sh voxora.integraretech.com.br
```

## Padrao de diretorios locais

```text
/var/www/<app>
/etc/nginx/sites-available/<app>
/etc/nginx/snippets/<app>-locations.conf
/home/ubuntu/apps/<repo>/.secrets/oci-lb/<hostname>/
```

## Quando usar wildcard

Use wildcard se:

- a maioria das apps estiver em `*.integraretech.com.br`;
- voce quiser reduzir manutencao de certificados;
- voce aceitar fazer DNS-01 para emissao/renovacao.

No ambiente atual, para preservar a Agora7app e acomodar novas apps no mesmo dominio, o alvo recomendado e:

- `*.integraretech.com.br`
- `*.agora7app.integraretech.com.br`

## Quando usar certificado por host

Use um certificado por host se:

- a app tiver dominio proprio;
- a renovacao puder ser tratada por app;
- voce ainda nao tiver wildcard automatizado.

## Quando usar SAN multi-host

Use SAN multi-host como etapa intermediaria se:

- voce ja tem varios hosts em producao no mesmo listener;
- precisa migrar sem downtime;
- ainda nao estruturou o processo de DNS-01.

Trade-off:

- e seguro e funcional no curto prazo;
- exige reemissao quando novos hosts forem adicionados;
- aumenta manutencao conforme o numero de apps cresce.

## Limites praticos

O OCI LB suporta hostnames virtuais no mesmo load balancer e listener HTTP/HTTPS. Para crescer alem de um grupo pequeno de apps, mantenha um inventario de:

- hostname
- backend set
- portas internas
- path de publicacao na VM
- certificado em uso

Quando o numero de apps ou isolamento exigir, separe por mais de um LB.

## Checklist de onboarding

1. Criar subdominio
2. Apontar para o IP do LB
3. Criar hostname virtual no LB
4. Criar backend set da app
5. Criar listener HTTP
6. Criar listener HTTPS
7. Emitir/importar certificado
8. Publicar frontend na VM
9. Subir API/worker
10. Instalar site NGINX
11. Testar `/health`
12. Testar acesso HTTPS publico

## Estrategia recomendada para este repositorio

Curto prazo:

1. manter o certificado SAN multi-host atual no listener compartilhado;
2. publicar novas apps com subdominio proprio e hostname no OCI LB;
3. evitar excluir certificados antigos antes de validar o novo certificado em producao.

Medio prazo:

1. emitir um certificado wildcard duplo com DNS-01;
2. associar esse certificado ao listener HTTPS compartilhado;
3. validar todos os hosts existentes;
4. remover os certificados SAN antigos apenas depois da validacao.

## Referencias oficiais OCI

- Virtual hostnames: https://docs.oracle.com/en-us/iaas/Content/Balance/Tasks/hostname_management.htm
- Listeners: https://docs.oracle.com/en-us/iaas/Content/Balance/Tasks/managinglisteners.htm
- Configuracao de listener, certificado e backend set: https://docs.oracle.com/en-us/iaas/Content/Security/Reference/configuration_tasks.htm
