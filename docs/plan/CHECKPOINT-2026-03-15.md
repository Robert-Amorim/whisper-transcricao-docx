# Checkpoint de Desenvolvimento (2026-03-15)

## Onde paramos

Fluxo principal de usuário foi iniciado e está funcional em modo local:

1. Cadastro/login com crédito inicial automático.
2. Criação de cobrança PIX (modo `mock`) para compra de créditos.
3. Confirmação de pagamento no dashboard (modo `mock`) e crédito na carteira.
4. Upload e criação de job condicionados a saldo disponível.
5. Worker com fluxo financeiro de `hold -> capture` em sucesso e `refund` em falha.
6. Área de gerenciamento no dashboard com:
   - saldo da carteira,
   - histórico de ledger,
   - painel de compra de créditos,
   - últimos pagamentos.
7. Integração PIX com Mercado Pago em modo de teste (`PAYMENT_PROVIDER_MODE=mercado_pago`) disponível via adapter dedicado.

## Implementado nesta sessão

- API:
  - `GET /v1/payments`
  - `POST /v1/payments/pix`
  - `POST /v1/payments/:id/confirm` (somente `PAYMENT_PROVIDER_MODE=mock`)
  - `POST /v1/webhooks/mercadopago` com idempotência de crédito por pagamento.
  - Adapter Mercado Pago (`apps/api/src/lib/mercado-pago.ts`) para:
    - criação de pagamento PIX real em sandbox,
    - consulta de status no webhook.
  - Crédito inicial no cadastro (`SIGNUP_WELCOME_CREDIT`) com lançamento no `wallet_ledger`.
  - Bloqueio de criação de transcrição quando saldo disponível é insuficiente.

- Worker:
  - Reserva de crédito (`hold`) antes de processar.
  - Captura (`capture`) após conclusão.
  - Reembolso (`refund`) em erro.
  - Chaves de idempotência para evitar duplicidade no ledger.

- Web (React + Vite):
  - Novo componente de gestão: `CreditManagementPanel`.
  - Criação de PIX no dashboard e confirmação em modo mock.
  - Exibição de últimos pagamentos.
  - Feedback de crédito de boas-vindas após cadastro.
  - Remoção de mocks fixos em jobs/ledger quando sem dados reais.

- Testes/smoke:
  - `scripts/smoke/run-e2e-api-worker.mjs` atualizado para validar também:
    - criação de PIX,
    - confirmação em modo `mock`,
    - aumento de saldo antes do upload.

## Arquivos principais alterados

- `apps/api/src/index.ts`
- `apps/worker/src/index.ts`
- `apps/web/src/components/dashboard/CreditManagementPanel.tsx`
- `apps/web/src/pages/DashboardPage.tsx`
- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/types.ts`
- `apps/web/src/components/dashboard/{DashboardStatsGrid,LedgerPanel,JobsTable,DashboardSidebar}.tsx`
- `apps/web/src/pages/LoginPage.tsx`
- `.env.example`

## Validação já executada

- `npm run typecheck` ✅
- `npm run smoke:contracts` ✅
- `npm run smoke:artifacts` ✅
- `npm run build --workspace @voxora/web` ✅
- `npx tsc -p tsconfig.build.json` em `apps/api` e `apps/worker` ✅
- `npm run build --workspace @voxora/api` ✅ (após liberar lock de processo Node)
- `npm run smoke:e2e` ✅ (cadastro -> PIX -> recarga -> upload -> transcrição -> download)

## Bloqueio conhecido

- Sem bloqueios críticos abertos no momento para build local.
- Atenção operacional: em Windows, se ocorrer novamente `EPERM` no Prisma, parar processos `node` da workspace antes de rodar `prisma generate`.

## Próximos passos para continuidade

1. Fechar integração real Mercado Pago:
   - validar assinatura oficial do webhook (modelo Mercado Pago),
   - validar payload real de eventos em homologação,
   - manter `mock` como fallback de desenvolvimento.

2. Garantir consistência financeira de ponta a ponta:
   - validar `hold/capture/refund` em cenários de retry e falha,
   - incluir casos de teste específicos para idempotência.

3. Preparar PR de fechamento da Semana 3:
   - descrição dos contratos alterados,
   - evidências de teste,
   - riscos e rollback.

## Pendências abertas (Semana 4)

1. Chunking real para arquivos longos:
   - cortes com overlap,
   - merge com correção de timestamps.

2. Retenção automática de áudio bruto:
   - rotina para expirar uploads em 7 dias.

3. DLQ e reprocessamento:
   - estratégia explícita para jobs que esgotarem retries.

4. Observabilidade mínima de produção:
   - correlação de logs (`request_id`, `user_id`, `job_id`),
   - visão operacional API/worker/fila.

## Comandos de retomada sugeridos

```bash
npm run typecheck
npm run smoke:contracts
npm run smoke:artifacts
npm run build --workspace @voxora/web
npm run build --workspace @voxora/api
```
