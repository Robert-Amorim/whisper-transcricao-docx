# MVP de Transcrição SaaS (Plano Corrigido: MySQL + Deploy Manual na Oracle VM)

## Resumo
Construir uma aplicação web para transcrever áudios com Whisper API, com cobrança de créditos pré-pagos a **R$ 0,27/minuto** (pró-rata por segundo), usando sua infraestrutura atual na Oracle Cloud com **VM + PM2 + NGINX**, **sem Docker**, banco **MySQL**, e fila assíncrona com **Redis na VM**.

## Correções aplicadas
- Banco alterado de PostgreSQL para **MySQL**.
- Estratégia de deploy alterada para **manual** (sem Docker).
- Redis confirmado **na própria VM**, com persistência **AOF + snapshot (RDB)**.

## Escopo fechado do MVP
- Idioma inicial: `pt-BR`.
- Acesso: conta obrigatória (cadastro/login).
- Pagamento: `Mercado Pago + PIX` (créditos pré-pagos).
- Processamento: assíncrono em fila.
- Saídas: visualização no painel + download `TXT` e `SRT`.
- Timestamps: por bloco/frase.
- Retenção de áudio original: 7 dias.

## Arquitetura final (produção)
- Frontend: `React + Vite + TypeScript`.
- API: `Node.js + TypeScript + Fastify`.
- Worker: processo Node separado no `PM2`.
- Fila: `BullMQ + Redis local`.
- Banco: `MySQL` (instância Oracle de teste, por enquanto).
- Armazenamento de arquivos: `Oracle Object Storage` com URL assinada.
- Transcrição: OpenAI `whisper-1`.
- Processamento de mídia: `ffmpeg` + `ffprobe` no worker.

## APIs públicas e contratos
- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `GET /v1/me`
- `GET /v1/wallet`
- `GET /v1/wallet/ledger`
- `POST /v1/payments/pix`
- `POST /v1/webhooks/mercadopago`
- `POST /v1/uploads/presign`
- `POST /v1/transcriptions`
- `GET /v1/transcriptions`
- `GET /v1/transcriptions/:id`
- `GET /v1/transcriptions/:id/download?format=txt|srt`

Tipos públicos:
- `JobStatus`: `uploaded | validating | queued | processing | completed | failed`
- `PaymentStatus`: `pending | approved | rejected | expired`
- `LedgerType`: `credit | hold | capture | refund | adjustment`

## Modelo de dados (MySQL)
- `users`: id, nome, email(unique), password_hash, created_at, updated_at.
- `wallets`: user_id(unique), available_balance DECIMAL(12,6), held_balance DECIMAL(12,6), updated_at.
- `wallet_ledger`: id, user_id, type, amount DECIMAL(12,6), job_id nullable, payment_id nullable, idempotency_key(unique), created_at.
- `payments`: id, user_id, provider, provider_payment_id(unique), amount DECIMAL(12,6), status, raw_payload JSON, created_at, updated_at.
- `transcription_jobs`: id, user_id, status, source_object_key, language, duration_seconds, price_per_minute DECIMAL(12,6), charge_amount DECIMAL(12,6), error_code, error_message, created_at, updated_at, completed_at.
- `transcription_chunks`: id, job_id, chunk_index, start_sec, end_sec, status, provider_request_id, created_at, updated_at.
- `job_outputs`: id, job_id, format(`txt|srt`), object_key, size_bytes, created_at.

Índices obrigatórios:
- `transcription_jobs(user_id, created_at)`
- `transcription_jobs(status, created_at)`
- `wallet_ledger(user_id, created_at)`
- `payments(status, created_at)`

## Regras financeiras
- Preço fixo: `0,27 BRL/min`.
- Fórmula de cobrança: `round(duration_seconds * 0.27 / 60, 6)`.
- Fluxo de saldo:
1. Criar job -> valida saldo.
2. Registrar `hold`.
3. Processar transcrição.
4. Sucesso -> `capture`.
5. Falha -> `refund` integral do hold.
- Exibição ao usuário com 2 casas; cálculo interno com 6 casas.
- Bloqueio de criação de job se `available_balance < valor_estimado`.

## Fluxo de processamento
1. Usuário gera upload URL assinada.
2. Frontend envia arquivo ao Object Storage.
3. API cria job `uploaded`.
4. Worker valida arquivo, lê duração com `ffprobe`, calcula cobrança, aplica hold.
5. Se necessário, chunk automático (10 min + overlap 1s).
6. Cada chunk é transcrito com Whisper.
7. Worker consolida texto e corrige timestamps por offset.
8. Gera `TXT` e `SRT`, grava outputs no Object Storage.
9. Atualiza job para `completed` e captura cobrança.
10. Em erro: job `failed` e refund.

Limites do MVP:
- Máximo por arquivo: 3 horas.
- Formatos aceitos: mp3, m4a, wav, mp4, webm, ogg, mpeg.
- Retenção de áudio bruto: remoção automática após 7 dias.

## Redis na VM (decisão final)
- Uso: fila de jobs e controle de retries.
- Persistência:
- `appendonly yes`
- `appendfsync everysec`
- `save 900 1 300 10 60 10000`
- Segurança:
- `requirepass` habilitado.
- Bind apenas `127.0.0.1` ou rede privada.
- Política de memória:
- `maxmemory-policy noeviction`.
- Serviço com `systemd`, start automático e restart automático.

## Deploy manual na Oracle VM (sem Docker)
1. Instalar `Node LTS`, `PM2`, `Nginx`, `Redis`, `ffmpeg`.
2. Configurar variáveis de ambiente (`.env`) para API/web/worker.
3. Build da aplicação (`web`, `api`, `worker`).
4. Subir processos no PM2:
- `transcribe-web`
- `transcribe-api`
- `transcribe-worker`
5. Configurar NGINX:
- `/` -> web
- `/api` -> api
6. Ativar TLS com Certbot.
7. Configurar backup do MySQL e rotação de logs.
8. Configurar limpeza diária de arquivos vencidos no Object Storage.

## Segurança e confiabilidade
- JWT access + refresh token com rotação.
- Hash de senha com `argon2`.
- Rate limit por IP e por usuário.
- Webhook Mercado Pago com validação de assinatura e idempotência.
- Logs estruturados com `request_id`, `user_id`, `job_id`.
- Retry exponencial para falhas transitórias da OpenAI (máx. 3 tentativas).
- Dead-letter queue para jobs falhados após retries.

## Testes e cenários de aceitação
- Unitário:
- cálculo financeiro em tempos críticos (1s, 59s, 60s, 3599s).
- transições de status do job.
- hold/capture/refund com idempotência.
- Integração:
- webhook PIX repetido não duplica crédito.
- upload + criação de job + execução worker + geração TXT/SRT.
- merge de chunks com timestamps contínuos.
- E2E:
- cadastro -> compra crédito -> upload -> transcrição -> download.
- saldo insuficiente bloqueia job antes do processamento.
- recuperação após reinício da VM sem perda de jobs pendentes.

## Plano de entrega (4 semanas)
1. Semana 1: estrutura web/api/worker, auth, schema MySQL, wallet e ledger.
2. Semana 2: upload presign, fila Redis/BullMQ, worker com chunk e Whisper.
3. Semana 3: Mercado Pago PIX, webhook idempotente, histórico e downloads.
4. Semana 4: hardening, testes E2E, observabilidade, retenção automática e go-live beta.

## Assumptions e defaults explícitos
- Banco Oracle atual é ambiente de teste/homolog inicialmente.
- Redis local na VM é suficiente para o volume inicial (até 100h/mês).
- Sem painel administrativo avançado no MVP (apenas operações essenciais).
- Texto final e metadados ficam armazenados para histórico; áudio bruto expira em 7 dias.
- Custos de API OpenAI são faturados separadamente do plano ChatGPT Plus.
