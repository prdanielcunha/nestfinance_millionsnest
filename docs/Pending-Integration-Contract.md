# Integração de Login com MillionsNest Hub — Estado Atual e Pendências

Este documento registra o contrato de Handoff entre o MillionsNest Hub e o NestFinance separando explicitamente o que está **confirmado no repositório do NestFinance** do que continua **não confirmado ou pendente de coordenação com o Hub**.

O código do NestFinance é a fonte de verdade para o lado NestFinance deste contrato. Este documento não deve ser usado para afirmar que um comportamento existe no Hub quando ele não foi verificado no repositório do Hub.

## 1. Fluxo confirmado no NestFinance

O seguinte fluxo está implementado no NestFinance:

1. A rota frontend `/auth/handoff` aceita um parâmetro `code`.
2. O cliente exige um código no formato URL-safe de 43 caracteres (`A-Z`, `a-z`, `0-9`, `_`, `-`).
3. Depois de validar o formato, o cliente remove o código da URL usando navegação com `replace` antes de continuar o resgate.
4. O cliente envia somente `{ code }` por `POST` para `/api/auth/handoff/redeem` com `Content-Type: application/json` e `cache: no-store`.
5. A operação é roteada pelo `auth-gateway` para `handoffRedeem.ts` e permanece protegida pela feature flag `NESTFINANCE_HANDOFF_REDEEM_ENABLED`.
6. O backend calcula `SHA-256(code)` e procura exclusivamente o documento `ecosystemHandoffs/{codeHash}`. O código bruto não é usado como ID do documento.
7. O backend valida, dentro de transação Firestore, que o Handoff:
   - existe;
   - possui `appId === 'nestfinance'`;
   - possui `version === 1`;
   - está com `status === 'issued'`;
   - ainda não possui `consumedAt`;
   - contém `uid`, `organizationId` e `accessSource`;
   - possui `expiresAt` válido e ainda não expirado.
8. O consumo é atômico: a mesma transação altera o documento para `status: 'consumed'`, grava `consumedAt` com timestamp do servidor e `consumedBy: 'nestfinance-redeem-v1'`.
9. Depois do consumo válido, o backend emite Firebase Custom Token para o `uid` validado com claims:
   - `mn_app_id: 'nestfinance'`;
   - `mn_organization_id` vindo do Handoff armazenado;
   - `mn_handoff_version: 1`;
   - `mn_access_source` vindo do Handoff armazenado.
10. O cliente usa `signInWithCustomToken()` e segue para `/finance`.
11. Após autenticação, o NestFinance resolve novamente o acesso por fontes canônicas server-side; roles, permissions e `organizationId` fornecidos arbitrariamente pela URL ou body não são fontes de autoridade.

## 2. Controles confirmados no resgate

O handler de resgate atualmente confirma os seguintes controles:

- `POST` obrigatório;
- `application/json` obrigatório;
- shape estrito do body: somente a propriedade `code`;
- código com formato e tamanho estritos;
- `Cache-Control: no-store, no-cache, must-revalidate`;
- `Pragma: no-cache` e `Expires: 0`;
- `X-Content-Type-Options: nosniff`;
- lookup apenas pelo hash SHA-256;
- validade temporal por `expiresAt`;
- consumo único e proteção contra replay concorrente por transação atômica;
- binding com `appId`, versão, `uid`, `organizationId` e `accessSource` armazenados server-side;
- mensagens de erro externas deliberadamente reduzidas para não revelar se o código não existe, expirou ou contém dados inválidos.

Há logs server-side de sucesso, rejeição e falha com duração, mas isso não equivale por si só a um contrato completo de auditoria persistente.

## 3. O que este repositório não confirma sobre a emissão no Hub

O NestFinance contém o **consumidor** do Handoff e o formato que ele espera encontrar em `ecosystemHandoffs/{codeHash}`. Este repositório, isoladamente, não prova como o Hub cria esses documentos.

Portanto continuam dependentes de verificação coordenada no Hub:

- geração criptograficamente aleatória do código bruto;
- confirmação de que somente o hash é persistido pelo emissor;
- valor exato do TTL usado na emissão;
- regras de elegibilidade anteriores à emissão (membership, instalação, entitlement, appAccess, permissions e scopes);
- comportamento quando o usuário troca de organização antes ou depois da emissão;
- origem e semântica exata de `accessSource`.

## 4. Pendências ainda não implementadas ou não confirmadas no NestFinance

Os seguintes itens **não devem ser tratados como implementados** apenas com base no código atual do NestFinance:

- binding explícito com `sessionVersion`;
- validação explícita de `Origin`/origem do navegador no handler de resgate;
- rate limit específico do endpoint de Handoff;
- política CORS específica do Handoff além do comportamento padrão da aplicação/plataforma;
- App Check no endpoint de resgate;
- auditoria durável específica de emissão/consumo além dos logs existentes;
- contrato coordenado de logout com o Hub;
- contrato completo de troca de organização;
- retorno explícito ao Hub após logout ou negação de acesso;
- revogação coordenada do Handoff por mudança de sessão no Hub.

Esses itens exigem slices próprios e não devem ser inferidos.

## 5. Estado de proteção contra replay

A proteção contra replay está **parcialmente implementada e confirmada** no lado NestFinance:

- o documento precisa estar `issued`;
- `consumedAt` precisa estar `null`;
- o consumo ocorre em transação Firestore;
- o primeiro resgate válido muda o estado para `consumed`;
- tentativas posteriores falham como Handoff inválido/expirado.

Isso protege o uso único do mesmo Handoff armazenado. Ainda não existe, neste contrato confirmado, binding explícito com `sessionVersion` ou outro mecanismo de revogação coordenada por mudança de sessão no Hub.

## 6. Autoridade e RBAC depois do Handoff

O Custom Token transporta o contexto mínimo necessário para entrar no NestFinance, mas não transforma dados vindos do navegador em autoridade.

O resolver canônico do NestFinance:

- lê `users/{uid}` server-side;
- usa somente `systemRole` para autoridade global;
- valida a organização server-side;
- aplica o gate atual de desenvolvimento;
- quando aplicável, usa `organizations/{orgId}/members/{uid}` como membership canônica e valida `enabledApps`, entitlement e `appAccess.nestFinance`.

Papéis organizacionais como `owner` não são papéis globais do ecossistema.

## 7. Próximas decisões coordenadas

Antes de declarar o Handoff totalmente fechado entre Hub e NestFinance, devem ser reconciliados com o repositório do Hub e certificados separadamente:

1. emissão e TTL canônicos;
2. `sessionVersion`/revogação;
3. rate limit e proteção antiabuso;
4. App Check, se adotado;
5. política de origem/CORS;
6. auditoria durável de emissão e consumo;
7. logout;
8. troca de organização;
9. retorno ao Hub;
10. testes end-to-end Hub → NestFinance para uso único, expiração, replay, sessão revogada e organização incorreta.

Até essa certificação, o Handoff deve ser descrito como **resgate NestFinance implementado e protegido por uso único**, com **contrato cross-app ainda parcialmente pendente**.
