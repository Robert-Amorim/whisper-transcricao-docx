# Plano de Execucao MVP (React + Vite)

Data de referencia: 2026-03-15
Escopo: Fechamento das Semanas 3 e 4 do MVP
Stack frontend oficial: React + Vite + TypeScript

## 0. Checkpoint atual

- Referência de continuidade: `docs/plan/CHECKPOINT-2026-03-15.md`
- Este checkpoint registra o estado implementado, validações executadas, bloqueios e próximos passos.

## 1. Objetivo

Concluir o MVP com fluxo financeiro real (PIX), integracao robusta de processamento, hardening operacional e criterio objetivo de go-live beta.

## 2. Estado atual resumido

Concluido:
- Monorepo funcional (web/api/worker/shared).
- Auth, wallet/ledger de consulta, upload presign, fila, processamento e downloads TXT/SRT.
- CI gate com typecheck/build/smoke.

Pendente critico:
- `POST /v1/payments/pix`.
- `POST /v1/webhooks/mercadopago` com idempotencia.
- Fluxo financeiro transacional completo: hold, capture, refund.
- Chunking real com overlap para arquivos longos.
- Retencao automatica de audio bruto (7 dias).
- DLQ explicita e observabilidade minima de producao.

## 3. Janela de execucao

- Semana 3: 2026-03-16 a 2026-03-22
- Semana 4: 2026-03-23 a 2026-03-29

## 4. Backlog priorizado

## P0 (bloqueia go-live)

1. Pagamentos PIX (API)
- Entregas:
  - `POST /v1/payments/pix` cria pagamento pendente e retorna payload para QR/PIX.
  - Persistencia em `payments` com `provider_payment_id` unico.
- Arquivos alvo:
  - `apps/api/src/index.ts`
  - `apps/api/src/lib/` (novo adapter `mercado-pago.ts`)
  - `packages/shared/src/index.ts` (tipos publicos de pagamento, se necessario)
- Criterios de aceite:
  - pagamento criado com status `pending`.
  - falha de provider retorna erro mapeado sem quebrar contrato HTTP.

2. Webhook Mercado Pago idempotente
- Entregas:
  - `POST /v1/webhooks/mercadopago` valida assinatura.
  - idempotencia por `provider_payment_id` + `idempotency_key` no ledger.
  - evento repetido nao duplica credito.
- Arquivos alvo:
  - `apps/api/src/index.ts`
  - `apps/api/prisma/schema.prisma` (apenas se precisar de novo indice/campo)
- Criterios de aceite:
  - chamada duplicada do mesmo webhook nao altera saldo duas vezes.
  - transicao de status em `payments` consistente.

3. Fluxo financeiro transacional do job
- Entregas:
  - Na criacao/validacao do job: valida saldo e registra `hold`.
  - Em sucesso do worker: registra `capture`.
  - Em erro do worker: registra `refund`.
  - operacoes com transacao e chaves idempotentes.
- Arquivos alvo:
  - `apps/api/src/index.ts`
  - `apps/worker/src/index.ts`
- Criterios de aceite:
  - saldo insuficiente bloqueia criacao de job.
  - ledger mostra sequencia correta (`hold` -> `capture` ou `refund`).

4. Chunking real para arquivos longos
- Entregas:
  - estrategia de chunks (ex.: 10 min + overlap 1s) quando necessario.
  - consolidacao de texto e correcao de timestamps por offset.
- Arquivos alvo:
  - `apps/worker/src/index.ts`
  - `apps/worker/src/lib/whisper.ts`
- Criterios de aceite:
  - arquivo acima do limite gera multiplos `transcription_chunks`.
  - saida final sem quebra de continuidade temporal.

## P1 (hardening de release)

5. Retencao automatica (7 dias)
- Entregas:
  - rotina agendada para remover audio bruto vencido.
  - preservar outputs finais e metadados.
- Arquivos alvo:
  - `scripts/` (novo script de cleanup)
  - `apps/worker/src` ou job de manutencao dedicado
- Criterios de aceite:
  - objetos de upload vencidos removidos conforme politica.

6. DLQ e resiliencia de fila
- Entregas:
  - fila de falhas finais (dead-letter) ou estrategia equivalente explicita.
  - metrica/log claro para jobs esgotados.
- Arquivos alvo:
  - `apps/api/src/index.ts`
  - `apps/worker/src/index.ts`
- Criterios de aceite:
  - job apos max retries fica rastreavel para reprocessamento manual.

7. Observabilidade minima
- Entregas:
  - logs com `request_id`, `user_id`, `job_id` em pontos criticos.
  - painel minimo de saude operacional (API/worker/fila).
- Arquivos alvo:
  - `apps/api/src/index.ts`
  - `apps/worker/src/index.ts`
- Criterios de aceite:
  - incidentes comuns permitem rastreamento fim-a-fim.

8. Testes de fechamento
- Entregas:
  - unit: calculo financeiro e transicoes de estado.
  - integracao: webhook duplicado e fluxo hold/capture/refund.
  - e2e: cadastro -> credito -> upload -> transcricao -> download.
- Arquivos alvo:
  - `scripts/smoke/`
  - testes nas workspaces impactadas
- Criterios de aceite:
  - `npm run gate:pr` verde.
  - smoke e2e cobrindo fluxo com saldo.

## 5. Plano por semana

## Semana 3 (2026-03-16 a 2026-03-22)

1. Dia 1-2
- Implementar adapter Mercado Pago e endpoint `POST /v1/payments/pix`.
- Ajustar tipos compartilhados necessarios.

2. Dia 3-4
- Implementar webhook idempotente.
- Fechar credito em carteira por evento aprovado.

3. Dia 5-6
- Integrar hold/capture/refund entre API e worker.
- Garantir idempotencia de ledger e transacoes.

4. Dia 7
- Testes de integracao e ajustes.
- PR de Semana 3 com gate verde.

## Semana 4 (2026-03-23 a 2026-03-29)

1. Dia 1-2
- Implementar chunking real + consolidacao de timestamps.
- Validar arquivos longos.

2. Dia 3
- Implementar retencao automatica de uploads vencidos.

3. Dia 4
- Implementar DLQ/estrategia de falhas finais.

4. Dia 5
- Fortalecer observabilidade e logs de correlacao.

5. Dia 6-7
- Rodar suite de fechamento (gate + smoke + validacao manual).
- Preparar release beta com rollback pronto.

## 6. Criterio de pronto para go-live beta

Obrigatorio:
- Endpoints de pagamento e webhook ativos e validados.
- Fluxo financeiro completo ativo (`hold/capture/refund`).
- Chunking real validado para arquivo longo.
- Retencao automatica funcionando.
- `npm run gate:pr` verde.
- Validacao em servidor: API health OK, worker consumindo fila, web servindo build.

## 7. Sequencia de deploy recomendada

1. Build `@voxora/shared`.
2. Deploy `api`.
3. Deploy `worker`.
4. Deploy `web`.
5. Migracoes de banco somente com backup previo.
6. Verificacao pos-deploy:
- `/health`
- criacao de pagamento PIX de teste
- webhook de teste (incluindo duplicado)
- job de transcricao completo com download TXT/SRT

## 8. Riscos e mitigacoes

1. Integracao Mercado Pago instavel
- Mitigacao: timeout, retry controlado, log estruturado e fallback de erro funcional.

2. Duplicidade de credito em webhook
- Mitigacao: idempotencia forte por chave unica e transacao atomica.

3. Quebra de contrato entre API e web
- Mitigacao: atualizar `packages/shared` e consumidores no mesmo PR.

4. Regressao em producao
- Mitigacao: seguir `docs/release/ROLLBACK_PLAN.md` e validar healthchecks apos deploy.
