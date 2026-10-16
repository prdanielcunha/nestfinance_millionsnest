# NestFinance → MillionsNest Connect — transação e outbox canônico (2026-10-16)

## Escopo implementado
O endpoint de classificação de evidência já grava na mesma transação o estado financeiro, a trilha de auditoria, `DOCUMENT_CLASSIFIED`, `INBOX_REVIEW_REQUIRED` e o recibo de idempotência existente `organizations/{organizationId}/financeIdempotency/{keyHash}`. Quando `NESTFINANCE_CONNECT_PENDING_EVENTS_ENABLED=true`, o recibo agora recebe `connectOutbox` com organização, entidade financeira, ID opaco de evidência, versão, estado e tentativas. O registro persiste **junto ao lançamento de classificação**, e não após uma tentativa HTTP. Nenhuma outra coleção, índice composto, Rule, função financeira ou plano Stripe é alterado.

`recoverFinanceConnectReceipt` somente aceita o hash e escopos já validados pelo servidor NestFinance (`finance.create_drafts`), lê um recibo de uma única entidade, confirma que o recibo foi concluído e corresponde ao resultado comprometido, usa lease transacional de 30s com token aleatório, busca o documento oficial atual e reusa o publisher assinador HMAC já existente. Somente HTTP 202 com confirmação explícita marca o evento `complete`. O body é opaco: não contém valores, imagens, CPFs, nomes, documento ou texto. Duplicatas por queda após 202 usam a chave estável do Connect e não causam duplicação de jobs.

O limite é três tentativas, com backoff e estado `needs_review` para evidência que deixou de estar pendente ou tentativas esgotadas. O reconhecimento de classificação retorna sem esperar a rede de integração. Quando a flag estiver desligada, não é escrito marcador algum, e todas as operações financeiras permanecem como antes.

## Gates ainda necessários
- **Desativado por padrão**: a flag, o secret HMAC independente da origem `nestfinance` e o destino aprovado `organizationId → {conversationId,recipientUid}` ainda não foram instalados nem homologados para usuários reais. O Connect deve verificar Hub, tenant, operador e estado da thread independentemente.
- **Recuperação oportunística, não agendada**: este incremento só tenta recuperar o recibo canônico no contexto de uma chamada autorizada. Um worker/scheduler seguro, externo à requisição, ainda é necessário para recuperação após desligamento total do serviço. Não afirmar entrega garantida ou ativar as flags sem ele.
- **Não é uma automação comercial**: o Connect não deve enviar Meta/template, contatar membros, acessar receitas/despesas ou revelar dados financeiros com esse evento; só a fila interna de operadores participa.
- **Autorização**: não permitir varredura de receipts da organização a partir de token do browser sem escopo entidade/financeiro confirmado. A política de retenção e revisões de `needs_review` deve ser certificada antes de escalar.
- **Aceite final #226**: fluxo real do WhatsApp/Meta, NestJourney publisher consentido, três aplicações e operadores reais, dispositivo iPhone bloqueado, configuração da fila e release guard ainda pendentes.

## Verificação
`npm run test:connect-pending-events`, `npm run test:finance-cross-app-events`, `npm run lint`, `npm run build:cloudrun` e checks completos no SHA exato, seguidos de revisão de código. O QA sintético nunca comprova consentimento real, WhatsApp da Meta ou push físico.
