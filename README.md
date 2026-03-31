# voxora-platform

Monorepo da plataforma de transcrição (web + api + worker), 100% em Node.js/TypeScript.

## Estrutura

```text
.
├─ apps/
│  ├─ web/                 # React + Vite + Tailwind
│  ├─ api/                 # Fastify + Prisma + JWT
│  └─ worker/              # BullMQ + Whisper API (OpenAI)
├─ packages/
│  └─ shared/              # tipos e contratos compartilhados
├─ scripts/
│  └─ dev-redis.js         # bootstrap do Redis local no dev
├─ tools/
│  └─ redis-windows/       # binários Redis para Windows
├─ docs/
│  ├─ design/              # referências visuais e HTML de apoio
│  ├─ plan/                # notas de transição
│  └─ release/             # plano de rollback e operação de release
├─ package.json            # scripts do workspace
└─ .env / .env.example
```

## Stack

- `apps/web`: React 19 + Vite + React Router + Tailwind
- `apps/api`: Fastify + Prisma + JWT
- `apps/worker`: BullMQ + OpenAI Whisper API
- `packages/shared`: contratos compartilhados

## Requisitos

- Node.js 22+
- MySQL 8+
- Redis 5+ (ou via `npm run dev`, que sobe Redis local automaticamente)
- FFmpeg no `PATH`

## Setup rápido

```powershell
npm install
Copy-Item .env.example .env
npm run typecheck
```

## Desenvolvimento

```powershell
npm run dev
```

Ou por serviço:

```powershell
npm run dev --workspace @voxora/web
npm run dev --workspace @voxora/api
npm run dev --workspace @voxora/worker
```

## Build

```powershell
npm run build
```

## Quality Gate (PR)

```powershell
npm run lint
npm run typecheck
npm run build
npm run smoke
```

Atalho:

```powershell
npm run gate:pr
```

Smoke E2E local (requer API + worker rodando com MySQL/Redis):

```powershell
npm run smoke:e2e
```

## Rollback

Plano versionado em:

- `docs/release/ROLLBACK_PLAN.md`

## Deploy Multiapp (OCI LB)

Padrao operacional para varias aplicacoes no mesmo OCI Load Balancer:

- `docs/infra/OCI_MULTIAPP_LB_RUNBOOK.md`

Resumo da estrategia de certificados:

- curto prazo: SAN multi-host compartilhado no listener HTTPS;
- medio prazo: wildcard duplo para `*.integraretech.com.br` e `*.agora7app.integraretech.com.br`;
- evitar excluir certificados antigos antes de validar o novo em producao.

Utilitarios locais:

- `scripts/ops/render-nginx-lb-app.sh`
- `scripts/ops/export-oci-lb-cert.sh`

Checklist operacional:

- `docs/infra/REBOOT_CHECKLIST.md`
- `docs/infra/REDIS_UPGRADE_RUNBOOK.md`
- `docs/infra/MERCADO_PAGO_SANDBOX_WEBHOOK.md`
- `npm run smoke:post-reboot`
- `npm run smoke:post-reboot:e2e`

## Prisma (API)

```powershell
npm run prisma:generate --workspace @voxora/api
npm run prisma:migrate --workspace @voxora/api
```

## Variáveis importantes (Worker)

- `WHISPER_PROVIDER=openai|simulation`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL` (default: `https://api.openai.com/v1`)
- `OPENAI_WHISPER_MODEL` (default: `whisper-1`)
- `OPENAI_TIMEOUT_MS`
- `OPENAI_MAX_FILE_BYTES`

Se `WHISPER_PROVIDER=openai`, o worker usa transcrição real via API Whisper.
