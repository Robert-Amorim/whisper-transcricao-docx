# Mercado Pago Sandbox e Webhook

Estado atual do fluxo PIX sandbox da Voxora e o que precisa estar configurado para o webhook funcionar de forma segura.

## O que esta validado

- criacao de pagamento PIX sandbox pela API;
- retorno do modo `mercado_pago` no fluxo de pagamento;
- aplicacao publica respondendo em `https://voxora.integraretech.com.br`;
- webhook agora falha fechado quando nenhum segredo de autenticacao estiver configurado.

## O que mudou no backend

A API agora rejeita o webhook com `401` se ambos estiverem ausentes:

- `PAYMENT_WEBHOOK_SIGNATURE_SECRET`
- `PAYMENT_WEBHOOK_SECRET`

Isso evita manter o endpoint publico sem autenticacao.

## Recomendacao para producao e sandbox real

Use o fluxo oficial de assinatura do Mercado Pago e configure:

- `PAYMENT_WEBHOOK_SIGNATURE_SECRET`
- `MERCADO_PAGO_WEBHOOK_URL=https://voxora.integraretech.com.br/v1/webhooks/mercadopago`

Com isso, a Voxora valida os headers esperados pelo Mercado Pago:

- `x-signature`
- `x-request-id`

## Onde configurar no Mercado Pago

1. Acesse o painel de desenvolvedor do Mercado Pago.
2. Abra a aplicacao usada pela Voxora.
3. Configure a URL de notificacao do webhook.
4. Habilite eventos de pagamento.
5. Copie o segredo de assinatura disponibilizado pelo Mercado Pago.
6. Preencha esse valor em `PAYMENT_WEBHOOK_SIGNATURE_SECRET`.
7. Reinicie a API com `pm2 restart transcribe-api --update-env`.

## Validacao recomendada depois de configurar o segredo

1. Criar um novo PIX sandbox.
2. Confirmar que o Mercado Pago envia a notificacao para `/v1/webhooks/mercadopago`.
3. Verificar que o pagamento muda para `approved`.
4. Verificar que a carteira recebe credito uma unica vez.
5. Repetir o mesmo webhook e confirmar idempotencia.

## Diagnostico rapido

Se o webhook responder `401`, verificar nesta ordem:

1. `PAYMENT_WEBHOOK_SIGNATURE_SECRET` preenchido no `.env`
2. `MERCADO_PAGO_WEBHOOK_URL` apontando para o dominio publico correto
3. headers `x-signature` e `x-request-id` chegando ao endpoint
4. relog da API com `pm2 logs transcribe-api --lines 100 --nostream`

## Referencias oficiais

- https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
- https://www.mercadopago.com.br/developers/pt/docs/checkout-api/additional-content/your-integrations/notifications/webhooks
