# Guia de Variáveis de Ambiente — Produção

## Obrigatórias (sem elas a aplicação não funciona)

| Variável | Serviço | Exemplo | Descrição |
|----------|---------|---------|-----------|
| `DATABASE_URL` | API/Worker | `mysql://user:pass@host:3306/voxora` | Conexão MySQL |
| `JWT_SECRET` | API | `(string aleatória ≥32 chars)` | Segredo para assinar tokens |
| `PASSWORD_RESET_TOKEN_PEPPER` | API | `(string aleatória ≥32 chars)` | Pepper dedicado para hash/HMAC dos tokens de redefinição |
| `REDIS_HOST` | API/Worker | `127.0.0.1` | Host do Redis |
| `REDIS_PORT` | API/Worker | `6379` | Porta do Redis |
| `REDIS_PASSWORD` | API/Worker | `(senha)` | Senha do Redis |
| `OPENAI_API_KEY` | Worker | `sk-...` | Chave da API OpenAI para Whisper |
| `UPLOAD_SIGNING_SECRET` | API | `(string aleatória ≥32 chars)` | Segredo para assinar URLs de upload |

## Recomendadas para produção

| Variável | Serviço | Default | Descrição |
|----------|---------|---------|-----------|
| `NODE_ENV` | Todos | `development` | Definir como `production` |
| `CORS_ALLOWED_ORIGINS` | API | `*` (dev) | Domínios separados por vírgula: `https://voxora.com.br` |
| `REQUEST_TIMEOUT_MS` | API | `60000` | Timeout de request em ms |
| `PAYMENT_PROVIDER_MODE` | API | `mock` | Usar `mercado_pago` em produção |
| `MERCADO_PAGO_ACCESS_TOKEN` | API | — | Token de produção do Mercado Pago |
| `VITE_MERCADO_PAGO_PUBLIC_KEY` | Web | — | Public Key do Mercado Pago usada pelo Brick de cartão |
| `PAYMENT_WEBHOOK_SIGNATURE_SECRET` | API | — | Secret para validar assinatura do webhook MP |
| `PAYMENT_WEBHOOK_SECRET` | API | — | Secret alternativo para webhook (fallback) |
| `MERCADO_PAGO_WEBHOOK_URL` | API | — | URL pública do webhook para notificações |
| `ADMIN_EMAILS` | API | — | Lista CSV de e-mails que devem subir como `admin` no bootstrap |
| `SUPPORT_EMAILS` | API | — | Lista CSV de e-mails que devem subir como `support` no bootstrap |

## Armazenamento (Oracle Object Storage)

| Variável | Default | Descrição |
|----------|---------|-----------|
| `OCI_PRIVATE_KEY_PATH` | — | Caminho para chave privada `.pem` |
| `OCI_TENANCY_OCID` | — | OCID do tenancy Oracle |
| `OCI_USER_OCID` | — | OCID do usuário Oracle |
| `OCI_FINGERPRINT` | — | Fingerprint da chave |
| `OCI_REGION` | — | Região Oracle (ex: `sa-saopaulo-1`) |
| `OCI_NAMESPACE` | — | Namespace do Object Storage |
| `OCI_BUCKET` | — | Nome do bucket |

> Se nenhuma variável OCI for definida, o sistema usa armazenamento local em `UPLOADS_DIR` / `OUTPUTS_DIR`.

## Opcionais (têm defaults seguros)

| Variável | Default | Descrição |
|----------|---------|-----------|
| `API_HOST` | `0.0.0.0` | Bind address da API |
| `API_PORT` | `3333` | Porta da API |
| `SIGNUP_WELCOME_CREDIT` | `1` | Crédito de boas-vindas (R$) |
| `PRICE_PER_MINUTE` | `0.27` | Preço por minuto de transcrição |
| `PIX_MIN_AMOUNT` | `10` | Valor mínimo PIX (R$) |
| `CARD_MIN_AMOUNT` | `15` | Valor mínimo cartão (R$) |
| `PIX_MAX_AMOUNT` | `5000` | Valor máximo PIX (R$) |
| `VITE_PIX_MIN_AMOUNT` | `10` | Valor mínimo PIX exibido no frontend (R$) |
| `VITE_CARD_MIN_AMOUNT` | `15` | Valor mínimo cartão exibido no frontend (R$) |
| `WORKER_CONCURRENCY` | `2` | Jobs simultâneos no worker |
| `TRANSCRIPTION_MAX_ATTEMPTS` | `3` | Tentativas antes de DLQ |
| `TRANSCRIPTION_RETRY_DELAY_MS` | `2000` | Delay base para retry (exponencial) |
| `RAW_UPLOAD_RETENTION_DAYS` | `7` | Dias para reter áudio bruto |
| `OPENAI_WHISPER_MODEL` | `whisper-1` | Modelo Whisper |
| `OPENAI_TIMEOUT_MS` | `300000` | Timeout da API OpenAI (ms) |

## Checklist pré-deploy

- [ ] `NODE_ENV=production` definido
- [ ] `JWT_SECRET` é uma string aleatória forte (≥32 chars)
- [ ] `PASSWORD_RESET_TOKEN_PEPPER` é uma string aleatória forte e diferente de `JWT_SECRET`
- [ ] `UPLOAD_SIGNING_SECRET` é uma string aleatória forte (≥32 chars)
- [ ] `CORS_ALLOWED_ORIGINS` aponta para o domínio do frontend
- [ ] `PAYMENT_PROVIDER_MODE=mercado_pago` com token de produção
- [ ] `REDIS_PASSWORD` definido e Redis bind em `127.0.0.1`
- [ ] `DATABASE_URL` aponta para banco de produção
- [ ] Backup do MySQL configurado (mysqldump ou equivalente)
- [ ] TLS configurado no NGINX
- [ ] `OPENAI_API_KEY` é uma chave de produção (não sandbox)
