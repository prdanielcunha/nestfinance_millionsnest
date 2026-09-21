# NestFinance — MillionsNest

NestFinance é o aplicativo financeiro do ecossistema MillionsNest. Ele opera como uma aplicação multi-tenant integrada ao Hub MillionsNest por Handoff, com autenticação, organização, memberships e RBAC resolvidos de forma canônica pelo ecossistema.

## Estado do repositório

Este repositório pode ser visível publicamente para transparência técnica e execução de CI, mas **não é software open source**. Consulte `LICENSE.md` antes de copiar, modificar, redistribuir ou usar o código em outro produto.

Nunca inclua neste repositório credenciais, tokens, chaves privadas, dumps de banco, comprovantes reais, dados pessoais ou identificadores operacionais de clientes.

## Stack

- React 19 + React Router v7
- TypeScript
- Tailwind CSS v4
- Vite 6
- Node.js 22
- Firebase Hosting + Cloud Run
- Firebase Auth / Firestore / Admin SDK
- Vercel somente como rollback/manual legado

## Estrutura

- `/api` — gateways HTTP reutilizados pelo runtime server-side
- `/src` — frontend React publicado pelo Firebase Hosting
- `/server` — handlers e lógica server-side reutilizados pelo Cloud Run
- `/cloudrun.ts` — adapter do serviço `nestfinance-api`
- `/shared` — contratos e lógica compartilhada
- `/scripts` — testes, certificações e verificações
- `/docs` — arquitetura, contratos e decisões

## Desenvolvimento

Instalação reproduzível:

```bash
npm ci
```

Comandos principais:

```bash
npm run dev
npm run lint
npm run build
npm run check:api-contracts
npm run check:vercel-entrypoints
npm run check:saas-isolation
npm run check:brand-assets
npm run test:certification-gates
```

Os demais testes canônicos estão declarados em `package.json` e nos workflows de `.github/workflows`.

## Segurança e multi-tenancy

- Autenticação suporta entrada direta com Google e Handoff do Hub MillionsNest, sempre reconciliados pelo backend canônico.
- O backend valida token e contexto da organização.
- `organizationId` e `financeEntityId` são fronteiras de segurança.
- O frontend nunca é fonte suficiente de autorização.
- Papéis, capabilities e escopos devem vir do resolver canônico.
- Não criar fontes paralelas de Auth, membership, organization ou RBAC.
- Universal Evidence permanece server-mediated e fail-closed.

Consulte `SECURITY.md`, `AGENTS.md` e `docs/ARCHITECTURE_CURRENT.md` antes de alterar áreas sensíveis.

## Variáveis de ambiente

Somente nomes/placeholders ficam em `.env.example`. Valores reais devem ser configurados no runtime seguro de produção e nunca commitados. O runtime canônico atual é Firebase Hosting + Cloud Run; Vercel não é o caminho normal de deploy.

Entre as variáveis server-side estão credenciais Firebase Admin, feature flags e, quando uma funcionalidade explicitamente habilitada exigir, chaves de provedores externos.

## Branches e promoção

- `main` — desenvolvimento/homologação integrada.
- `production` — linha de produção; não deve receber alterações automáticas ou incidentais.
- Mudanças devem ocorrer em branches de escopo pequeno e chegar a `main` por PR após gates e auditoria.
- Promoção para `production` é uma decisão separada e explícita.
- O release atômico publica Cloud Run + Firebase Hosting e só é considerado saudável depois de validar também o domínio canônico `https://nestfinance.millionsnest.com`.

## Automação de engenharia

ChatGPT e Codex são os operadores de IA atualmente usados no projeto. Qualquer operador deve seguir o mesmo protocolo: repository-first, escopo mínimo, evidência real de testes, preservação de multi-tenancy/RBAC e nenhuma alteração direta em `production`.

## Universal Capture / Inbox

O Universal Capture preserva evidências originais de forma autorizada e mantém os envelopes dentro de `organizations/{orgId}/financeEntities/{financeEntityId}`. As fases atuais são deliberadamente fail-closed e não criam posting financeiro automaticamente. Camadas de OCR/IA só podem ser habilitadas em slices explicitamente desenhados e certificados.

## Divulgação responsável

Não publique vulnerabilidades, segredos ou dados reais em Issues/PRs. Consulte `SECURITY.md`.

---

Copyright © 2026 NestFinance / MillionsNest project maintainers. Todos os direitos reservados.
