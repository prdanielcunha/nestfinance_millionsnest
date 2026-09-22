# Integração de Login com MillionsNest Hub — Estado Atual e Pendências

Este documento registra o contrato de autenticação/handoff entre o MillionsNest Hub e o NestFinance e separa o que está **confirmado nos dois repositórios** do que ainda depende de uma fase coordenada.

Estado verificado em 2026-09-22:

- Hub `prdanielcunha/millionsnest` — `main` contendo a PR #193, merge `95cf64496211225e0d523a0742f8c5b484cdf2e2`;
- NestFinance `prdanielcunha/nestfinance_millionsnest` — `main` contendo Balance #169 e hardening de handoff #171, merge `e61512e505cba424d0a9e07671affc4ed4d81dc7`.

O código e os testes continuam sendo a fonte de verdade. Este documento não substitui regras reais de RBAC, multi-tenancy, Firebase Auth, Firestore ou os gates de release.

## 1. Dois fluxos de Handoff coexistem

O ecossistema possui atualmente dois caminhos compatíveis com o NestFinance. Eles não devem ser confundidos.

### 1.1 Fluxo atual do launcher canônico — `ecosystem_ctx`

No Hub:

1. A rota canônica `/apps/nestfinance/launch` usa `EcosystemAppLaunch`.
2. O launcher resolve usuário e organização canônicos e chama `openEcosystemModule()`.
3. O Hub envia `POST /api/ecosystem/create-handoff` com Bearer ID token e `{ appId: 'nestfinance', orgId, supportMode }`.
4. O backend usa `resolveEcosystemAppAccess()` antes de emitir qualquer token.
5. Para NestFinance, o Firebase Custom Token mantém os claims genéricos do ecossistema e também inclui o namespace estrito esperado pelo NestFinance:
   - `mn_app_id: 'nestfinance'`;
   - `mn_organization_id`;
   - `mn_handoff_version: 1`;
   - `mn_access_source`.
6. Roles, permissions e scopes não são serializados como autoridade dentro do token.
7. A resposta do Hub usa `protocolVersion: '1.0.0'` e `expiresAt = now + 300000` (5 minutos).
8. O launcher valida a resposta, cria `ecosystem_ctx` e direciona para `https://nestfinance.millionsnest.com/auth/handoff`.

No NestFinance:

1. `/auth/handoff` reconhece `ecosystem_ctx`.
2. O contexto curto é removido do histórico do navegador antes de continuar.
3. O cliente valida `appId`, protocolo, `userId`, `orgId`, custom token e expiração.
4. Depois de `signInWithCustomToken()`, o NestFinance força leitura atualizada do ID token.
5. Antes de navegar, valida novamente as claims assinadas:
   - app precisa ser `nestfinance`;
   - versão precisa ser `1`;
   - organização precisa ser válida;
   - organização assinada precisa ser a mesma do contexto do launcher;
   - UID autenticado precisa ser o mesmo UID esperado.
6. Em qualquer divergência, o cliente faz sign-out e falha fechado.
7. Depois do login, autorização e escopos são re-resolvidos server-side; o payload do navegador não é autoridade de RBAC.

### 1.2 Fluxo de código de uso único — `ecosystemHandoffs/{codeHash}`

O Hub também mantém um emissor específico em `POST /api/ecosystem/nestfinance/handoff/issue`.

Esse emissor foi verificado no repositório do Hub e:

1. exige feature flag e URL de destino configurada;
2. exige autenticação;
3. valida organização por `resolveEcosystemAppAccess()`;
4. gera `crypto.randomBytes(32).toString('base64url')`;
5. calcula SHA-256 do código;
6. persiste somente o hash como ID de `ecosystemHandoffs/{codeHash}`;
7. grava `version: 1`, `appId: 'nestfinance'`, UID, organização, `accessSource`, estado `issued`, timestamps e `consumedAt: null`;
8. usa TTL de 90 segundos;
9. retorna uma URL `/auth/handoff?code=...`.

No NestFinance, o resgate:

1. aceita somente código URL-safe de 43 caracteres;
2. remove o código da URL antes do resgate;
3. envia somente `{ code }` a `POST /api/auth/handoff/redeem`;
4. calcula SHA-256 e lê exclusivamente `ecosystemHandoffs/{codeHash}`;
5. valida app, versão, estado, UID, organização, `accessSource` e expiração;
6. consome o documento atomicamente em transação Firestore;
7. marca `status: 'consumed'`, `consumedAt` e `consumedBy: 'nestfinance-redeem-v1'`;
8. emite Firebase Custom Token com as claims `mn_*`;
9. depois do sign-in, o cliente também valida as claims assinadas antes de navegar.

## 2. Autoridade depois do Handoff

O Handoff estabelece identidade e contexto de organização, mas não substitui autorização canônica.

O NestFinance:

- usa `verifyIdToken(token, true)` nas rotas financeiras sensíveis;
- trata `mn_organization_id` como organização vinculada quando a sessão veio do Handoff;
- rejeita conflito entre organização assinada e `x-organization-id`;
- lê `users/{uid}` server-side;
- usa somente `systemRole` canônico para autoridade global;
- valida organização server-side;
- usa `organizations/{orgId}/members/{uid}` como membership canônica quando aplicável;
- revalida entitlement, `appAccess.nestFinance`, permissions, capabilities e scopes;
- aplica isolamento por `financeEntityId`.

Papéis organizacionais como `owner` não se tornam automaticamente papéis globais do ecossistema.

## 3. Controles confirmados

### 3.1 Código de uso único

Estão confirmados:

- aleatoriedade criptográfica no emissor;
- persistência do hash, não do código bruto;
- TTL de 90 segundos;
- autorização canônica antes da emissão;
- lookup somente pelo hash;
- consumo único;
- proteção contra replay concorrente por transação atômica;
- mensagens externas reduzidas no resgate;
- headers `no-store`, `Pragma: no-cache` e `nosniff` no consumidor.

### 3.2 Launcher `ecosystem_ctx`

Estão confirmados:

- autorização canônica antes da emissão;
- TTL de resposta de 5 minutos;
- vínculo app + organização no token assinado;
- validação UID/organização no cliente antes de navegar;
- ausência de roles/permissions/scopes como autoridade serializada;
- re-resolução server-side depois do login.

Esse fluxo não possui o mesmo documento de consumo único do fluxo por código. Portanto não deve ser descrito como tendo a mesma semântica de replay do `ecosystemHandoffs`.

## 4. Pendências ainda abertas

Os itens abaixo continuam **não fechados** e exigem slices próprios:

- `sessionVersion` canônico e revogação coordenada por mudança de sessão;
- rate limit específico dos endpoints de emissão/resgate;
- validação explícita de `Origin` onde fizer sentido;
- política CORS específica do Handoff em vez de depender apenas da configuração geral;
- App Check, se adotado para esses endpoints;
- auditoria durável e consultável de emissão, consumo, rejeição e revogação;
- contrato coordenado de logout;
- contrato completo de troca de organização;
- retorno explícito ao Hub após logout ou negação de acesso;
- E2E automatizado Hub → NestFinance cobrindo os dois protocolos em ambiente integrado;
- estratégia explícita de descontinuação do protocolo legado, caso o `ecosystem_ctx` seja declarado único protocolo canônico.

## 5. `sessionVersion` — estado atual

Não foi encontrado um `sessionVersion`, `tokenVersion` ou equivalente canônico implementado no Hub neste estado verificado.

Por isso o NestFinance **não deve inventar um contador local paralelo**.

A fase correta precisa coordenar:

1. fonte canônica no Hub;
2. valor incluído no Handoff;
3. claim assinada;
4. comparação server-side no NestFinance;
5. comportamento em refresh token;
6. incremento/revogação em logout global, troca crítica de sessão ou ação administrativa;
7. testes de sessão antiga após incremento.

Até essa fase existir, a revogação depende dos mecanismos atuais do Firebase Auth, da verificação de token revogado e da re-resolução server-side de acesso/organização.

## 6. Replay — estado preciso

### Fluxo de código

A proteção contra replay está implementada no nível da aplicação:

- documento precisa estar `issued`;
- `consumedAt` precisa estar nulo;
- consumo é transacional;
- primeiro resgate válido muda o estado;
- resgates posteriores do mesmo Handoff falham.

### Fluxo `ecosystem_ctx`

O contexto possui expiração curta e binding assinado, mas não possui hoje um registro NestFinance de consumo único equivalente ao documento `ecosystemHandoffs`.

Consequentemente, “binding curto e validado” e “uso único persistido” devem permanecer conceitos distintos na documentação e nos testes.

## 7. Próximas fases recomendadas

A sequência técnica recomendada para fechar o contrato cross-app é:

1. manter os claims `mn_*` certificados em Hub e NestFinance;
2. implementar `sessionVersion`/revogação coordenada;
3. definir rate limiting e proteção antiabuso;
4. decidir Origin/CORS/App Check;
5. criar auditoria durável;
6. fechar logout/troca de organização/retorno ao Hub;
7. adicionar E2E integrado dos dois protocolos;
8. decidir se o fluxo legado por código permanece como fallback ou será formalmente descontinuado.

Até lá, a descrição correta é:

> **O Handoff Hub → NestFinance está funcional e fortemente vinculado a identidade/organização nos dois protocolos atuais; o código de uso único possui replay protection transacional, enquanto revogação coordenada de sessão, antiabuso, auditoria durável e ciclo completo de logout/troca de organização ainda estão pendentes.**
