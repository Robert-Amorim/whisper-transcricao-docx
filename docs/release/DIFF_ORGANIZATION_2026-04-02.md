# Organização do Diff — 2026-04-02

## Objetivo

Separar o workspace atual em grupos coerentes para release, reduzindo risco de subir mudanças paralelas sem necessidade.

## Recomendação

Se a prioridade for uma atualização mais segura e objetiva, publique primeiro o **Pacote A** e o **Pacote B**.

- `Pacote A`: autenticação, verificação de e-mail, recuperar senha e hardening de sessão.
- `Pacote B`: transcripts, variantes, tradução, PDFs e runtime relacionado.

Deixe o **Pacote C** para um release separado se o objetivo não for também redesenho/refino visual amplo.

## Pacote A — Auth e Segurança

Arquivos que devem ir juntos:

- `.env.example`
- `docs/ENV_PRODUCTION.md`
- `apps/api/package.json`
- `apps/api/prisma/schema.prisma`
- `apps/api/src/index.ts`
- `apps/api/src/types/fastify-jwt.d.ts`
- `apps/api/prisma/migrations/20260401000000_add_email_verification/migration.sql`
- `apps/api/prisma/migrations/20260402153000_add_password_reset/migration.sql`
- `apps/api/prisma/migrations/20260402165000_add_session_version_for_auth_hardening/migration.sql`
- `apps/web/src/App.tsx`
- `apps/web/src/lib/api.ts`
- `apps/web/src/pages/LoginPage.tsx`
- `apps/web/src/pages/ProfilePage.tsx`
- `apps/web/src/pages/ResetPasswordPage.tsx`
- `apps/web/src/pages/VerifyEmailPage.tsx`
- `package-lock.json`

Dependências e observações:

- `apps/api/src/index.ts` depende das migrations acima.
- `apps/web/src/App.tsx` depende de `ResetPasswordPage.tsx` e `VerifyEmailPage.tsx`.
- Não commitar `.env`.

## Pacote B — Transcript, Tradução e PDF

Arquivos que devem ir juntos:

- `apps/api/prisma/schema.prisma`
- `apps/api/src/index.ts`
- `apps/api/prisma/migrations/20260402120000_add_transcripts_and_output_variants/migration.sql`
- `apps/web/src/App.tsx`
- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/transcriptions.ts`
- `apps/web/src/lib/types.ts`
- `apps/web/src/pages/NewTranscriptionPage.tsx`
- `apps/web/src/pages/TranscriptionDetailPage.tsx`
- `apps/web/src/pages/TranscriptionResultPage.tsx`
- `apps/web/src/pages/TranscricoesPage.tsx`
- `apps/web/src/pages/CarteiraPage.tsx`
- `apps/web/src/components/dashboard/DashboardSidebar.tsx`
- `apps/worker/package.json`
- `apps/worker/src/index.ts`
- `apps/worker/src/lib/transcript-artifacts.ts`
- `apps/worker/src/lib/translation.ts`
- `packages/shared/src/index.ts`
- `scripts/smoke/check-contracts.mjs`
- `package-lock.json`

Dependências e observações:

- `packages/shared/src/index.ts` e `scripts/smoke/check-contracts.mjs` precisam ir juntos.
- `apps/worker/package.json` e `package-lock.json` precisam ir juntos por causa de `pdf-lib`.
- `apps/web/src/App.tsx` também entra aqui se você quiser expor as rotas novas de transcrições/carteira.
- `apps/api/src/index.ts` aparece nos Pacotes A e B porque hoje ele concentra os dois domínios.

## Pacote C — UI/UX e Refino Visual Amplo

Esses arquivos parecem mais próximos de redesign/refino visual do produto do que de requisito operacional do release:

- `apps/web/index.html`
- `apps/web/src/components/dashboard/CreditManagementPanel.tsx`
- `apps/web/src/components/dashboard/DashboardStatsGrid.tsx`
- `apps/web/src/components/dashboard/DashboardTopbar.tsx`
- `apps/web/src/components/dashboard/JobsTable.tsx`
- `apps/web/src/components/dashboard/LedgerPanel.tsx`
- `apps/web/src/components/landing/CtaSection.tsx`
- `apps/web/src/components/landing/HeroSection.tsx`
- `apps/web/src/components/landing/MarketingFooter.tsx`
- `apps/web/src/components/landing/MarketingHeader.tsx`
- `apps/web/src/components/landing/ProfessionalSection.tsx`
- `apps/web/src/pages/DashboardPage.tsx`
- `apps/web/src/pages/HomePage.tsx`
- `apps/web/src/pages/NotFoundPage.tsx`
- `apps/web/src/styles/globals.css`
- `apps/web/tailwind.config.ts`

Arquivos removidos que parecem parte desse redesenho/limpeza:

- `apps/web/src/components/auth/LoginStatesPanel.tsx`
- `apps/web/src/components/common/MonitoringPanel.tsx`
- `apps/web/src/components/common/StatusStateGrid.tsx`
- `apps/web/src/components/dashboard/DashboardMobileUserBar.tsx`
- `apps/web/src/components/dashboard/OptimizationTip.tsx`
- `apps/web/src/components/landing/PricingSection.tsx`
- `apps/web/src/components/transcriptions/UploadStateGrid.tsx`

## Fora do Release

Esses itens não parecem parte do deploy do produto:

- `.codex/skills/design-system-workflow/SKILL.md`
- `.codex/skills/design-system-workflow/agents/openai.yaml`
- `.codex/skills/design-system-workflow/references/design-workflow.md`
- `.codex/skills/design-system-workflow/references/frontend-design.md`
- `.claude/commands/frontend-design.md`
- `CLAUDE.md`

## Estratégia Sugerida

Release menor e mais seguro:

1. Subir `Pacote A`
2. Subir `Pacote B`
3. Segurar `Pacote C` para um release visual separado

Release único, mais amplo:

1. `Pacote A`
2. `Pacote B`
3. `Pacote C`

## Comandos Úteis

Inspeção do pacote A:

```bash
git diff -- \
  .env.example \
  docs/ENV_PRODUCTION.md \
  apps/api/package.json \
  apps/api/prisma/schema.prisma \
  apps/api/src/index.ts \
  apps/api/src/types/fastify-jwt.d.ts \
  apps/api/prisma/migrations/20260401000000_add_email_verification/migration.sql \
  apps/api/prisma/migrations/20260402153000_add_password_reset/migration.sql \
  apps/api/prisma/migrations/20260402165000_add_session_version_for_auth_hardening/migration.sql \
  apps/web/src/App.tsx \
  apps/web/src/lib/api.ts \
  apps/web/src/pages/LoginPage.tsx \
  apps/web/src/pages/ProfilePage.tsx \
  apps/web/src/pages/ResetPasswordPage.tsx \
  apps/web/src/pages/VerifyEmailPage.tsx \
  package-lock.json
```

Inspeção do pacote B:

```bash
git diff -- \
  apps/api/prisma/schema.prisma \
  apps/api/src/index.ts \
  apps/api/prisma/migrations/20260402120000_add_transcripts_and_output_variants/migration.sql \
  apps/web/src/App.tsx \
  apps/web/src/lib/api.ts \
  apps/web/src/lib/transcriptions.ts \
  apps/web/src/lib/types.ts \
  apps/web/src/pages/NewTranscriptionPage.tsx \
  apps/web/src/pages/TranscriptionDetailPage.tsx \
  apps/web/src/pages/TranscriptionResultPage.tsx \
  apps/web/src/pages/TranscricoesPage.tsx \
  apps/web/src/pages/CarteiraPage.tsx \
  apps/web/src/components/dashboard/DashboardSidebar.tsx \
  apps/worker/package.json \
  apps/worker/src/index.ts \
  apps/worker/src/lib/transcript-artifacts.ts \
  apps/worker/src/lib/translation.ts \
  packages/shared/src/index.ts \
  scripts/smoke/check-contracts.mjs \
  package-lock.json
```
