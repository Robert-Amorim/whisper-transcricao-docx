# Plano MVP de Atendimento ao Usuário e Painel Admin/Suporte

## Resumo
Construir um MVP de suporte operacional dentro da própria Voxora, com duas superfícies no mesmo app:
- área do usuário para abrir e acompanhar tickets `in-app`;
- área interna `/admin` para equipe `admin` e `support` consultar usuários, jobs, pagamentos, carteira e responder chamados.

O canal principal será `ticket no app`. Além disso, haverá um formulário público de contato que cria um `pré-ticket` para triagem; esse fluxo continua por e-mail até a pessoa criar conta. O MVP será `consulta + ticket + notas`, sem ações financeiras ou de autenticação sensíveis.

## Mudanças de implementação
### Auth, permissões e modelo de dados
- Adicionar `UserRole` ao usuário com valores `customer | support | admin`; default `customer`.
- Incluir `role` no JWT e no payload de `/v1/me` para permitir guards no frontend e autorização no backend.
- Criar guard específico para rotas internas (`admin` e `support`) separado do `ProtectedRoute` atual.
- Não incluir UI de gestão de roles no MVP; bootstrap inicial de `admin/support` será via script operacional ou env de bootstrap idempotente.
- Criar entidades de suporte no banco:
  - `SupportThread`: canal (`in_app | public_form`), status (`new | open | waiting_user | waiting_support | resolved | closed`), prioridade (`normal` default), assunto, requester vinculado ou público, assignee opcional, timestamps.
  - `SupportMessage`: thread, autor (`customer | support | admin | system`), autorUserId opcional, corpo, canal de entrega (`in_app | email`), visibilidade pública.
  - `SupportInternalNote`: thread, autorUserId, corpo, timestamps.
- Não criar event store genérico no MVP; a timeline operacional será composta por dados já existentes (`jobs`, `payments`, `wallet_ledger`) mais os registros de suporte.

### Área do usuário
- Adicionar rota autenticada `/suporte`.
- Funcionalidades:
  - listar tickets do próprio usuário;
  - abrir novo ticket com categoria, assunto e descrição;
  - ver detalhe do ticket e enviar novas mensagens;
  - ver status atual e última atualização.
- Categorias iniciais fixas: `acesso`, `pagamento`, `transcricao`, `entrega`, `conta`.
- Não enviar e-mails automáticos para tickets `in_app` no MVP; acompanhamento é pelo próprio painel.
- Adicionar link para suporte na navegação autenticada e link público `/contato` no marketing/footer.

### Formulário público e follow-up
- Adicionar rota pública `/contato`.
- Formulário com `nome`, `email`, `categoria`, `assunto`, `mensagem`.
- Submissão cria `SupportThread` com canal `public_form` e sem usuário autenticado.
- Equipe responde a esse tipo de solicitação por e-mail a partir do painel interno; cada envio gera um `SupportMessage` com canal `email`.
- Não implementar ingestão de resposta por e-mail no MVP.
- Se o contato depois criar conta, o admin poderá vincular manualmente o pré-ticket ao usuário.

### Painel interno `/admin`
- Mesmo app React, com layout próprio e guard de role.
- Rotas internas:
  - `/admin`: visão operacional com métricas e filas.
  - `/admin/tickets`: fila de tickets com filtros.
  - `/admin/tickets/:id`: detalhe do ticket com conversa, notas internas e contexto do usuário.
  - `/admin/users`: busca/lista de usuários.
  - `/admin/users/:id`: detalhe operacional do usuário.
- Permissões:
  - `support`: ver usuários, tickets, jobs, pagamentos, carteira; responder tickets; adicionar notas internas; alterar status/assignee do ticket.
  - `admin`: tudo que `support` faz + vincular ticket público a usuário e acessar métricas completas.
- O painel de usuário detalhado deve consolidar:
  - perfil básico;
  - saldo e extrato recente;
  - pagamentos recentes;
  - jobs recentes e falhas;
  - tickets associados;
  - notas internas e contexto de suporte.
- O dashboard interno deve mostrar no mínimo:
  - tickets abertos;
  - tickets aguardando suporte;
  - jobs falhos nas últimas 24h;
  - pagamentos pendentes/rejeitados recentes.

## APIs, contratos e tipos públicos
- Expandir `PublicUser` com `role`.
- Novos endpoints do usuário:
  - `GET /v1/support/tickets`
  - `POST /v1/support/tickets`
  - `GET /v1/support/tickets/:id`
  - `POST /v1/support/tickets/:id/messages`
  - `POST /v1/support/public-requests`
- Novos endpoints internos:
  - `GET /v1/admin/support/summary`
  - `GET /v1/admin/tickets`
  - `GET /v1/admin/tickets/:id`
  - `POST /v1/admin/tickets/:id/messages`
  - `POST /v1/admin/tickets/:id/notes`
  - `PATCH /v1/admin/tickets/:id`
  - `PATCH /v1/admin/tickets/:id/link-user`
  - `GET /v1/admin/users`
  - `GET /v1/admin/users/:id`
- Respostas internas devem ser aditivas e compostas de dados já existentes onde possível; evitar duplicar estruturas de `jobs`, `payments` e `wallet`.

## Testes e cenários
- Backend:
  - usuário `customer` só acessa seus próprios tickets;
  - rota `/admin` bloqueia `customer`;
  - `support` acessa leitura operacional, mas não endpoints administrativos exclusivos;
  - criação de ticket autenticado;
  - criação de contato público;
  - resposta interna em ticket `in_app`;
  - envio de e-mail em thread `public_form`;
  - mudança de status `open -> waiting_user -> resolved -> closed`;
  - vínculo manual de pré-ticket a usuário.
- Frontend:
  - navegação de usuário para `/suporte`;
  - criação/listagem/detalhe de ticket;
  - formulário público `/contato`;
  - guard de role para `/admin`;
  - filtros e detalhe no painel interno.
- Aceite manual:
  - cliente autenticado abre ticket e recebe resposta no app;
  - contato público chega ao painel e recebe resposta por e-mail;
  - suporte consegue enxergar contexto operacional do usuário sem editar pagamentos/créditos;
  - admin consegue vincular um contato público a uma conta existente.

## Assumptions e defaults escolhidos
- O MVP não terá chat em tempo real, SLA automático, macros, tags, CRM ou ingestão de e-mails recebidos.
- O MVP não permitirá ações sensíveis como ajuste manual de créditos, reset forçado de senha, alteração de pagamento ou mudança manual de status financeiro.
- O painel interno viverá no mesmo frontend, em `/admin`, reaproveitando a infraestrutura atual.
- `ticket no app` será o fluxo principal para usuários logados; o formulário público serve como porta de entrada pré-cadastro.
- Roles iniciais serão provisionadas por mecanismo operacional, não por UI.
