# Integração de Login com MillionsNest Hub — Contrato Certificado

Este documento registra o contrato vigente de autenticação, handoff, revogação e ciclo de sessão entre o MillionsNest Hub e o NestFinance.

Estado verificado em 2026-09-23:

- Hub `prdanielcunha/millionsnest` — produção verificada em `92d3f52578e1b94db37fc08371cd60376506dec2`;
- NestFinance `prdanielcunha/nestfinance_millionsnest` — baseline de produção anterior a este slice de fechamento em `714396669eb6c87ed20623134b572e79639f1180`;
- o SHA efetivamente publicado pelo NestFinance é verificável em `/api/system/release` e é certificado pelo workflow de Production Release antes de o domínio canônico ser considerado saudável.

O código, os testes e os gates de release continuam sendo a fonte de verdade. Este documento não substitui Firebase Auth, Firestore Rules, RBAC, multi-tenancy nem os controles server-side.

## 1. Protocolos suportados

### 1.1 Launcher canônico — `ecosystem_ctx`

Este é o caminho canônico do Hub para o NestFinance.

No Hub:

1. `/apps/nestfinance/launch` resolve usuário e organização canônicos.
2. O backend autoriza o acesso antes da emissão.
3. O Firebase Custom Token do NestFinance usa somente o binding assinado necessário:
   - `mn_app_id: 'nestfinance'`;
   - `mn_organization_id`;
   - `mn_handoff_version: 1`;
   - `mn_access_source`;
   - `mn_session_version`.
4. Roles, permissions e scopes não são serializados como autoridade no token.
5. A emissão é protegida por política explícita de Origin, rate limit durável e auditoria sanitizada.
6. O launcher cria o contexto curto `ecosystem_ctx` e direciona para `https://nestfinance.millionsnest.com/auth/handoff`.

No NestFinance:

1. o contexto é retirado do histórico do navegador antes de continuar;
2. app, versão, UID, organização, expiração e claims assinadas são validados;
3. divergência de app, versão, organização, UID ou `mn_session_version` falha fechado;
4. a autorização real é re-resolvida server-side após o login;
5. sessão antiga após incremento do `ecosystemSessionVersion` é rejeitada.

### 1.2 Código de uso único — fallback compatível

O fluxo `ecosystemHandoffs/{codeHash}` permanece suportado como fallback de compatibilidade. Ele não é o launcher preferencial.

No Hub:

1. gera 32 bytes criptograficamente aleatórios em base64url;
2. persiste apenas o SHA-256 do código;
3. TTL de 90 segundos;
4. grava `sessionVersion` canônico no handoff;
5. aplica autorização, Origin, rate limit e auditoria antes de expor o código;
6. falha de auditoria após a criação revoga o handoff e não expõe o token.

No NestFinance:

1. formato inválido é rejeitado antes de qualquer lookup;
2. tentativa com formato válido passa por Origin e rate limit durável antes do lookup;
3. o documento é consumido atomicamente;
4. replay falha;
5. `sessionVersion` emitido precisa ser igual ao canônico atual;
6. consumo bem-sucedido e evento de auditoria são persistidos na mesma transação;
7. UID é persistido apenas como hash em auditoria;
8. tentativas aleatórias `NOT_FOUND` não geram uma gravação de auditoria por tentativa, evitando write amplification.

## 2. Session version e revogação coordenada

A fonte canônica é `users/{uid}.ecosystemSessionVersion`, com valor mínimo efetivo 1.

O Hub incrementa a versão em eventos de revogação coordenada, incluindo logout global e troca crítica de organização. Os dois protocolos incluem a versão emitida. O NestFinance compara a versão assinada/emitida contra a versão canônica antes de conceder continuidade a uma sessão vinculada por handoff.

Consequências:

- handoff emitido antes de uma revogação deixa de poder criar sessão válida;
- sessão Hub antiga falha fechado;
- sessão direta Google continua suportada sem namespace `mn_*`;
- quando uma sessão direta cria/troca contexto de organização dentro do NestFinance, o novo token passa a carregar o `mn_session_version` canônico.

## 3. Autoridade e isolamento

Depois do handoff, o NestFinance:

- usa verificação de ID token com revogação nas rotas financeiras sensíveis;
- rejeita namespace `mn_*` parcial;
- impede retarget de organização por header quando a sessão está vinculada;
- lê `users/{uid}` e membership canônicos;
- reconhece acesso global apenas pelos papéis canônicos `ceo`, `global_admin`, `ecosystem_owner` e `founder`;
- não transforma `owner` organizacional em papel global;
- exige membership/appAccess/entitlement para usuários comuns;
- aplica escopo de `financeEntityId` server-side.

## 4. Antiabuso e auditoria

Controles vigentes:

- Origin allowlist explícita, sem wildcard;
- localhost apenas fora de produção;
- ausência de Origin permitida para chamadas server/trusted;
- rate limit durável por escopo estável;
- Hub: limite de emissão por usuário/app/organização;
- NestFinance: limite de redeem por fingerprint de rede hasheado;
- auditoria durável para emissão, resgate, rejeições conhecidas, rate limit, Origin rejeitada e revogação;
- dados sensíveis como UID são hasheados quando apropriado;
- códigos brutos nunca são persistidos.

## 5. Logout, retorno ao Hub e recuperação

O NestFinance distingue sessão originada no Hub de sessão direta.

- **Voltar ao MillionsNest** retorna ao Hub sem encerrar a sessão local.
- **Sair do NestFinance** encerra a autenticação local, limpa contexto de ciclo de sessão e retorna ao Hub.
- 401 causado por sessão Hub revogada aciona recuperação pelo launcher canônico, preservando somente um `returnTo` local validado.
- sessão direta não entra em loop de recuperação via Hub.
- PT, EN e ES estão cobertos pelos testes de lifecycle.

## 6. Estratégia dos dois protocolos

Decisão vigente:

- `ecosystem_ctx` é o protocolo canônico do launcher do Hub;
- o código de uso único permanece como fallback compatível v1;
- ele não será removido silenciosamente;
- descontinuação futura exige evidência de migração/telemetria e um release explícito.

## 7. App Check

App Check **não foi adotado** neste fechamento.

Motivo: não há um padrão App Check já estabelecido e certificado para esse conjunto de endpoints no ecossistema. Introduzi-lo apenas no NestFinance poderia quebrar handoff legítimo, direct entry ou chamadas server-mediated sem fornecer uma política uniforme.

Isto não é tratado como blocker de release porque os endpoints já usam binding assinado, sessão canônica, revogação, autorização server-side, Origin, rate limit, auditoria e TTL curto. App Check continua elegível como defesa em profundidade quando houver um padrão de ecossistema.

## 8. Certificação cross-app

A certificação final é composta por duas camadas:

1. testes determinísticos de contrato/integração nos dois repositórios;
2. release smoke do SHA exato em Cloud Run, Firebase Hosting e domínio canônico.

No Hub, os testes de produção cobrem emissão, segurança de handoff e `ecosystemSessionVersion`. No NestFinance, o bundle `test:cross-app-final-certification` cobre sessão canônica, binding de app/versão/organização, stale session, direct entry, redeem, replay, rate limit, Origin, auditoria, logout/retorno e contexto financeiro.

O smoke de produção valida ainda endpoints não autenticados/negados e o SHA publicado. Um browser synthetic com credencial humana de produção não é usado como gate para evitar depender de uma identidade privilegiada persistente no CI.

## 9. Limite contábil intencional

`approved_for_posting` significa **aprovado para o próximo passo**. Não significa lançamento contábil realizado.

Real posting continua isolado e desligado até o slice específico de design/certificação de posting ser concluído e possuir feature flag, idempotência, auditoria, reversão e gates próprios.

## 10. Estado final deste contrato

Não há blocker conhecido de autenticação/handoff para o Hub → NestFinance dentro do contrato acima.

A próxima fronteira não é “consertar login”; é certificar o mecanismo de **real posting** sem misturar aprovação humana com mutação contábil.
