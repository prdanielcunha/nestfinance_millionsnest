# NestFinance - MillionsNest

Este repositório pertence ao aplicativo **NestFinance**, parte do ecossistema MillionsNest (identificado internamente via pacote como `react-example`).

## Visão Geral
O NestFinance é um aplicativo de gestão financeira integrado como parte do ecossistema MillionsNest. Ele opera recebendo sessões de autenticação via Handoff a partir do Hub MillionsNest. Não há login paralelo ou cadastro de contas direto neste aplicativo. Toda autenticação e resolução de acesso flui estritamente pelo Hub e é validada server-side.

## Tecnologias e Stack
- **Frontend:** React 19, React Router v7, Tailwind CSS v4, framer-motion.
- **Backend:** Node.js (via Vercel Serverless Functions), Express, `firebase-admin` (v13.10.0).
- **Banco de Dados:** Firebase Firestore.
- **Autenticação:** Firebase Auth (validado no backend via token ID e custom tokens).
- **Linguagem:** TypeScript (typecheck via `tsc`).
- **Build/Dev:** Vite 6.

## Estrutura do Repositório
- `/api/` - Pontos de entrada para Serverless Functions da Vercel (gateways).
- `/src/` - Código do Frontend React.
- `/server/` - Código do Backend (Vercel handlers e lógicas compartilhadas).
- `/scripts/` - Scripts utilitários, validação de contratos e testes.
- `/docs/` - Documentação arquitetural e de projeto (ADRs, contratos, etc).

## Pré-requisitos
- Node.js versão 22.x (configurada em `package.json` engines).
- NPM para gerenciamento de pacotes.

## Comandos Operacionais (Scripts)
O gerenciador de pacotes utilizado é o **npm**.

- **Instalação:** `npm install`
- **Desenvolvimento:** `npm run dev` (inicia o Vite na porta 3000)
- **Build:** `npm run build` (compila o frontend via Vite)
- **Preview Local:** `npm run preview`
- **Typecheck (Lint):** `npm run lint` (`tsc --noEmit`)
- **Validações de Contrato e Backend:**
  - `npm run check:api-contracts` (valida rotas de API do Vercel)
  - `npm run check:vercel-entrypoints`
  - `npm run check:saas-isolation`
  - `npm run check:brand-assets`

## Variáveis de Ambiente
As variáveis de ambiente requeridas estão documentadas no arquivo `.env.example`. Não inserir valores reais em código.

**Client-side (configuradas no runtime via Vercel ou env):**
- `APP_URL`
- Variáveis do Firebase Client (não expostas diretamente no `.env.example`, dependendo da inicialização)

**Server-side (Segredos / Feature Flags):**
- `GEMINI_API_KEY`
- `NESTFINANCE_HANDOFF_REDEEM_ENABLED`
- `NESTFINANCE_SESSION_RESOLVE_ENABLED`
- Flags de feature write (`NESTFINANCE_SETUP_WRITE_ENABLED`, etc.)
- Credenciais Firebase Admin (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`)

## Arquitetura Resumida
A arquitetura é dividida em Frontend (React SPA) e Backend Serverless. O Frontend é servido via Vite (em desenvolvimento) e os endpoints da API (sob `/api/`) são mapeados via `vercel.json` para arquivos de gateway que delegam as operações para a pasta `/server/vercel-handlers/`.

A separação Multitenant baseia-se fortemente em `organizationId`, validada em todo acesso. Consulte `/docs/ARCHITECTURE_CURRENT.md` para mais detalhes.

## Autenticação e Autorização
A autenticação acontece via "Handoff" do Hub MillionsNest. Um redirecionamento gera um código que é consumido no backend (`/api/auth/handoff/redeem`), resultando em um Custom Token do Firebase. A resolução da sessão valida o papel global, papel organizacional, capabilities (RBAC) e as fronteiras (Boundaries) no frontend asseguram a exibição correta. 

Consulte `/docs/Pending-Integration-Contract.md` para visualizar as etapas de login pendentes de coordenação.

## Banco de Dados
Firebase Firestore. Usa as coleções raiz `users`, `organizations`, `organization_members` e as subcoleções (e.g. `organizations/{orgId}/financeAccounts`, `financeTransactions`, etc).

## Deploy
Deploy é configurado para a Vercel através de rotas/rewrites em `vercel.json`. O script `prebuild` valida contratos antes da publicação (`check:vercel-entrypoints` e `check:brand-assets`).

## Documentação Adicional
- [Arquitetura Atual](./docs/ARCHITECTURE_CURRENT.md)
- [Protocolo de Mudança de IA](./docs/AI_CHANGE_PROTOCOL.md)
- [Arquitetura Frontend](./docs/Frontend-Architecture.md)
- E outras referências disponíveis na pasta `/docs/`.

---
*O Google AI Studio é o único agente autorizado a modificar o código e sincronizar alterações na branch `main`.*
*A branch `main` representa desenvolvimento e homologação.*
*A branch `production` representa o código aprovado e publicado.*
