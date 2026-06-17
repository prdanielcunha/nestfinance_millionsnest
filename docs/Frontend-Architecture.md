# Arquitetura Frontend

Este projeto utiliza React 19, TypeScript, Vite 6 e React Router v6.

## Estrutura e Roteamento
O App é encapsulado pelo `createBrowserRouter`. A fonte única da verdade para caminhos é o arquivo `routes.ts`.

- **Lazy Loading**: As páginas de domínios (Finance, Count, etc.) são importadas atráves do `React.lazy()` para isolamento de bundle.
- **Boundaries**: Existem fronteiras estritas entre roteamento e autenticação/interface:
  - `AppErrorBoundary`: Lida com falhas em tempo de renderização do nível de aplicação.
  - `RouteErrorBoundary`: Reage aos problemas gerados pelo `react-router` (ex: pág não econtradas 404).
  - `AuthBoundary`: Aguarda inicialização do Firebase e lida com roteamento para estado de não autenticado.
  - `EcosystemAccessBoundary`: Representa o portão de controle de claims/hubs (atualmente mostra pendência).
- **Preview em Dev**: Em tempo de desenvolvimento (DEV), existe uma rota adicional secreta (`APP_ROUTES.preview`), que ajuda a validar layout (`ShellLayout`) sem bater em pendências de acessos. No runtime ela é cortada do array de rotas e não aumenta o chunk ou risco de segurança.

## Vercel e Deep Links
Um `vercel.json` foi configurado e incluído, lidando com `rewrites` no modo SPA. Atualizações na página `/finance` são direcionadas ao `/index.html` primeiro, e então roteadas pelo React. Prefixos `/api/(.*)` são mantidos puros para serem interceptados por qualquer Serverless Function futura caso seja adicionada.
