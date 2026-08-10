# Diretrizes para Agentes de IA (AGENTS.md)

Este repositório pertence ao aplicativo **NestFinance**, parte do ecossistema MillionsNest. 

O Google AI Studio é o agente autorizado a modificar o código e sincronizar alterações na branch `main`. ChatGPT e Codex atuarão primariamente como auditores e revisores em modo somente leitura, ou operadores técnicos autônomos restritos às instruções abaixo.

---

## Project Purpose
O NestFinance é o módulo financeiro do ecossistema MillionsNest. Ele lida com gestão de contas, movimentações, categorização e configuração financeira de organizações, recebendo acesso delegado e autenticação via "Handoff" do Hub central da MillionsNest.

---

## Mandatory Reading
Antes de modificar qualquer código, o agente deve, obrigatoriamente:
1. Ler este `AGENTS.md` e o `README.md`.
2. Ler a documentação técnica relevante (`/docs/ARCHITECTURE_CURRENT.md` e `/docs/AI_CHANGE_PROTOCOL.md`).
3. Localizar a implementação atual no código (busque gateways, handlers e UI).
4. Localizar os scripts/testes associados (ex: `check:api-contracts`).
5. Identificar as dependências e o impacto de qualquer mudança.
6. Somente depois de concluir as etapas acima, iniciar alterações.

---

## Source of Truth
A fonte da verdade técnica deste projeto é, na ordem:
1. O código implementado (`/server`, `/api`, `/src`).
2. Os contratos e scripts de verificação (`scripts/check-api-contracts.mjs`).
3. A documentação técnica na pasta `/docs`.
4. Arquivos de configuração (`package.json`, `vercel.json`, `firebase.json`).

Se houver conflito entre a documentação e o código, **investigue a causa**. Não assuma silenciosamente. Se não conseguir resolver, registre como dúvida. Para regras de negócio amplas ou roadmap histórico, utilize o kit externo de sucessão.

---

## Architecture Overview
A aplicação possui Frontend SPA (React/Vite) e Backend Serverless (Vercel Node.js). 
Endpoints em `/api/` (gateways) mapeiam requisições para a pasta `/server/vercel-handlers/`.
O Banco de dados é o Firebase Firestore. A separação de dados por organização é a fundação da arquitetura (Multi-tenant).

---

## Repository Structure
Caminhos importantes:
- `/api/` - Gateways de Serverless Functions (Entrypoints Vercel).
- `/src/` - Aplicação Frontend (React).
- `/server/` - Backend e validações server-side.
- `/server/vercel-handlers/` - Handlers isolados por domínio (`auth/`, `finance/`, etc).
- `/scripts/` - Validações de integração contínua (CI).
- `/docs/` - Documentação detalhada.

---

## Critical Areas
- **Autenticação (Handoff)**: O fluxo em `/server/vercel-handlers/auth/` é a barreira crítica que previne acessos ilegais ao sistema. Nenhuma alteração pode burlar isso.
- **Multitenancy (`organizationId`)**: Qualquer query ao Firestore no backend e frontend DEVE filtrar por `mn_organization_id` ou respectivo document path que isole as organizações. Misturar dados é o pior cenário possível.
- **Autorização (RBAC)**: O `ecosystemSessionResolver.ts` ou equivalentes no backend ditam o poder do usuário. Nunca aceitar claims confiantemente apenas do frontend.
- **Gateways e `vercel.json`**: O roteamento API é frágil e mapeado manualmente. Mudanças precisam passar no `check:api-contracts`.

---

## Development Rules
1. **Entender o Comportamento Atual:** Entender como funciona a lógica antes de propor mudanças.
2. **Escopo Estrito:** Fazer alterações SOMENTE no escopo solicitado. Não expanda tarefas sem necessidade.
3. **Sem Refatorações Oportunistas:** Não faça refatorações de arquivos que não estão envolvidos na tarefa principal.
4. **Preservar Padrões:** Reutilizar hooks, contexts, serviços e UI (Tailwind) existentes.
5. **Zero Bypasses:** Nunca crie bypasses de segurança por e-mail, UID, nome ou valor hardcoded.
6. **Não Confiar no Frontend:** Autorizações e limites devem ser checados no backend.
7. **Internacionalização (i18n):** Todo novo texto visível deve suportar PT, EN, ES através da estrutura existente.
8. **Fontes Únicas de Verdade:** Não criar fontes paralelas de identidade, organizações, memberships ou entitlements. A fundação já existe.

---

## Commands
*Sempre utilize os comandos existentes no `package.json`.*

- **Install:** `npm install`
- **Development:** `npm run dev`
- **Tests / Validations:**
  - `npm run check:api-contracts`
  - `npm run check:vercel-entrypoints`
  - `npm run check:saas-isolation`
  - `npm run check:brand-assets`
- **Typecheck / Lint:** `npm run lint`
- **Build:** `npm run build`

*Nunca invente um comando que não conste no `package.json`.*

---

## Testing Requirements
Antes de concluir e confirmar mudanças:
1. Verifique o Typecheck e Lint via `npm run lint`.
2. Garanta que o Build funciona via `npm run build`.
3. Se alterou API ou infraestrutura, execute `npm run check:api-contracts` e `npm run check:vercel-entrypoints`.
4. Não declare sucesso sem ter evidência real do comando executado.

---

## Definition of Done
A tarefa será considerada concluída quando:
- O escopo estiver totalmente implementado.
- Nenhuma alteração incidental/desnecessária tiver sido introduzida.
- Build (`npm run build`) e Lint (`npm run lint`) passarem sem erros.
- A segurança (RBAC, Multi-tenant, Autenticação) continuar intacta e testada.
- Documentação for atualizada caso algo no comportamento arquitetural mude.
- Riscos remanescentes forem documentados explicitamente.

---

## Security Rules
- **NUNCA** exponha secrets, tokens, API keys ou credenciais reais.
- **NUNCA** comite variáveis sensíveis no `.env.example` além de seus nomes.
- **NUNCA** reduza a segurança para fazer algo funcionar temporariamente.
- Trate qualquer alteração de rotas protegidas ou do Firestore como risco altíssimo.

---

## Environment Variables
(Requeridos - Apenas os nomes constam aqui)
- `GEMINI_API_KEY`
- `APP_URL`
- `NESTFINANCE_HANDOFF_REDEEM_ENABLED`
- `NESTFINANCE_SESSION_RESOLVE_ENABLED`
- `NESTFINANCE_*_WRITE_ENABLED` (feature flags)
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`

---

## Database / Persistence Rules
- Utilize o Firestore Admin SDK (`firebase-admin`) apenas do lado do servidor (na pasta `/server/`).
- Ao manipular queries, sempre restrinja o acesso garantindo que os usuários estão lendo/gravando dentro de `/organizations/{orgId}` com o ID de organização verificado no JWT.
- A segurança das collections baseia-se na imutabilidade do UID e no pertencimento a Organizações.

---

## Authentication / Authorization Rules
- O frontend é barrado no `AuthBoundary` e no `EcosystemAccessBoundary`. 
- Autenticação e claims vêm do "Handoff" com o Hub, não confie em cookies avulsos sem validação do token JWT assinado pela Firebase.

---

## Cross-Project Integrations
- O projeto depende ativamente da integração com o ecossistema MillionsNest Hub. 
- O contrato de integração pendente e o fluxo Handoff estão documentados em `/docs/Pending-Integration-Contract.md`. Detalhes não explicitados neste repósitorio estão: **A VALIDAR COM O KIT EXTERNO DE SUCESSÃO**.

---

## UI / UX Rules
- **Design System:** Use os componentes Tailwind (v4) existentes, priorizando classes utilitárias e o `cn()` quando aplicável. 
- **Responsividade:** Pratique Mobile First, aplique layouts adaptáveis a desktops (Desktop Excellent).
- Evite sistemas visuais paralelos.

---

## High-Risk Files / Modules
- `/vercel.json` e `scripts/check-api-contracts.mjs` (Roteamento).
- `/server/vercel-handlers/auth/` (Autenticação e Handoff).
- Qualquer middleware ou lib que carregue token (ex: `ecosystemSessionResolver.ts`).
- Componentes do tipo Boundary (`AuthBoundary`, etc).

---

## Known Technical Risks
- O sistema de rotas no Vercel mesclando SPA (React) com Serverless (API) exige cuidado especial nos rewrites (risco alto de quebrar navegação ou interceptar rotas de forma incorreta).

---

## Change Discipline
O agente NÃO DEVE:
- Alterar partes do código não solicitadas;
- Remover lógica sem compreendê-la;
- Fazer grandes refatorações visando corrigir algo menor;
- Alterar as dependências no `package.json` de forma leviana;
- Realizar mudanças irreversíveis sem confirmação e backup da lógica.

---

## Documentation Discipline
Se a arquitetura, comandos, dependências, APIs, sistema de build ou rotas de Vercel sofrerem qualquer mudança profunda, os documentos em `/docs`, o `README.md` e este `AGENTS.md` devem ser adequadamente retificados na mesma alteração.

---

## When Uncertain
1. Investigue o código (busque por referências grep/find).
2. Investigue scripts de teste em `/scripts/`.
3. Revise as configurações e `vercel.json`.
4. Leia `/docs`.
5. **NÃO SUPONHA**. Se mesmo assim a resposta estiver ausente, declare como inconclusivo, registre no relatório ou pergunte, referenciando que tal informação possivelmente resida no **Kit Externo de Sucessão**.
