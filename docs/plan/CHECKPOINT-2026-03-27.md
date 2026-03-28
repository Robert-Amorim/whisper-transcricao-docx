# Checkpoint de Desenvolvimento (2026-03-27)

## Status geral

**Todos os itens do backlog MVP (Semanas 1-4) estão implementados.**
O projeto está pronto para validação em servidor e go-live beta.

## Itens concluídos (Semana 3-4)

### P0 — Bloqueia go-live
1. ✅ Pagamentos PIX (mock + Mercado Pago sandbox)
2. ✅ Webhook idempotente com validação de assinatura HMAC-SHA256
3. ✅ Fluxo financeiro transacional (hold/capture/refund) com idempotência
4. ✅ Chunking real para arquivos longos (10min + overlap 1s configurável)

### P1 — Hardening
5. ✅ Retenção automática de áudio bruto (7 dias, cleanup batch no worker)
6. ✅ DLQ com routing automático após max retries
7. ✅ Observabilidade mínima (logs estruturados com request_id/user_id/job_id)
8. ✅ Testes de fechamento (58 assertions unitárias + E2E)

## Suite de testes

| Script | Assertions | Cobertura |
|--------|-----------|-----------|
| `test-financial-calc.mjs` | 14 | Cálculo pro-rata em tempos críticos |
| `test-job-states.mjs` | 25 | Máquina de estados completa |
| `test-idempotency-keys.mjs` | 8 | Unicidade e namespacing de chaves |
| `test-hold-capture-refund.mjs` | 11 | Invariantes de saldo e edge cases |
| `test-insufficient-balance.mjs` | E2E | Bloqueio por saldo insuficiente |

## Validação executada

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run build` ✅
- `npm run test:unit` ✅ (58 assertions)
- `npm run smoke:artifacts` ✅
- `npm run smoke:contracts` ✅
- `npm run gate:pr` ✅

## Próximos passos para go-live beta

1. Deploy em servidor Oracle VM (shared → api → worker → web)
2. Validação pós-deploy:
   - `/health` OK
   - Criação de pagamento PIX real em sandbox
   - Webhook de teste (incluindo duplicado)
   - Job de transcrição completo com download TXT/SRT
3. Configurar domínio + TLS com Certbot
4. Monitorar primeiros jobs em produção
