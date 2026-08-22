# Arquitetura Atual — NestFinance

## 1. Responsabilidade
- **Nome do Aplicativo:** NestFinance (nomeado no código como `react-example` no `package.json`, mas visivelmente como NestFinance na interface).
- **Responsabilidade:** Aplicativo de gestão financeira, integrado como parte do ecossistema MillionsNest.
- **Ecossistema:** Opera recebendo sessões de autenticação do Hub MillionsNest.

## 2. Stack Tecnológica
- **Frontend:** React 19, react-router-dom v7, Tailwind CSS v4, framer-motion.
- **Backend:** Node.js (via Vercel Serverless Functions), Express, `firebase-admin` (v13.10.0).
- **Banco de Dados:** Firebase Firestore.
- **Autenticação:** Firebase Auth, validado no backend via token ID e `verifyIdToken`.
- **Linguagem:** TypeScript (typecheck via `tsc`).
- **Build/Bundler:** Vite.

## 3. Estrutura de Diretórios
- `/api/`: Entrypoints para Serverless Functions (ex: `auth-gateway.ts`, `finance-gateway.ts`).
- `/src/`: Código do Frontend React.
  - `/src/app/`: Configurações globais de layout e rotas (`router.tsx`, `ShellLayout.tsx`).
  - `/src/components/`: Componentes UI reutilizáveis.
  - `/src/contexts/`: Contextos globais (ex: `FinanceEntityContext`).
  - `/src/hooks/`: Hooks customizados (ex: `useAuth`).
  - `/src/pages/`: Telas da aplicação.
  - `/src/services/`: Serviços client-side (ex: `sessionResolutionService.ts`).
  - `/src/lib/`: Configurações de bibliotecas de terceiros (ex: `firebase.ts`).
- `/server/`: Código do Backend.
  - `/server/vercel-handlers/`: Handlers Vercel por domínio (`auth/`, `finance/`, `system/`).
  - `/server/shared/`: Código compartilhado no backend.
- `/scripts/`: Scripts utilitários e de teste.

## 4. Pontos de Entrada (Entrypoints)
- **Frontend:** `/src/main.tsx` → `/src/App.tsx`.
- **Backend (API):** `/api/auth-gateway.ts`, `/api/finance-gateway.ts`, `/api/system-gateway.ts`.
- As rotas da API no `/api` roteiam o tráfego para os arquivos em `/server/vercel-handlers/` com base no parâmetro `operation` ou através das reescritas do `vercel.json`.

## 5. Rotas do Frontend (Principais)
Localizadas em `/src/app/router/routes.ts`:
- `/auth/handoff`: Recebe transição de autenticação (Handoff).
- `/finance`: Dashboard principal.
- `/finance/transactions`: Lista de movimentações (transactions).
- `/finance/capture`: Universal Capture documental.
- `/finance/inbox`: Fila server-mediated de documentos e evidências da entidade financeira ativa.
- `/finance/settings`: Configurações (com sub-rotas para accounts, entities, funds, categories).

## 6. Fluxo de Autenticação e RBAC
- **Autenticação:** Gerenciada pelo Firebase Auth via `useAuth.ts`. Ao detectar login, envia o token para `/api/auth/session/resolve`.
- **Resolução de Organização Ativa:** A organização (`mn_organization_id`) é extraída nativamente do token JWT gerado pelo ecossistema MillionsNest. A verificação é realizada no backend (Server-side). NUNCA aceitar cegamente o `organizationId` apenas do frontend.
- **Resolução de Permissões (RBAC):** Feita no backend em `/api/_lib/ecosystemSessionResolver.ts`.
  - **Papéis Globais:** `ceo`, `admin`, `global_admin`, `ecosystem_owner`, `founder`, `global_support` ganham `isGlobalAccess: true`.
  - **Papéis Organizacionais:** Validados através de documentos em `organizations/{orgId}/users/{uid}` ou na raiz `organization_members`. Carrega um array de `capabilities`.
- O Frontend reflete o estado disso através de Boundaries (`AuthBoundary`, `EcosystemAccessBoundary`, `OrganizationalAccessBoundary`).

## 7. Modelagem Firestore
**Coleções e Subcoleções conhecidas (NÃO VERIFICADO todos os usos, mas identificadas no código backend e RBAC):**
- `users`: Usuários.
- `organizations`: Organizações.
- `organization_members`: Membros organizacionais (raiz).
- `organizations/{orgId}/users`: Membros da organização (subcoleção).
- `organizations/{orgId}/financeSettings`: Configurações financeiras.
- `organizations/{orgId}/financeAccounts`: Contas financeiras.
- `organizations/{orgId}/financeCategories`: Categorias de despesas/receitas.
- `organizations/{orgId}/financeFunds`: Fundos/reservas.
- `organizations/{orgId}/financeTransactions`: Movimentações financeiras (registro principal do posting).

## 8. Variáveis de Ambiente
Utilizadas:
- `NESTFINANCE_SESSION_RESOLVE_ENABLED` (usada no `sessionResolve.ts`).
Nenhum segredo de banco, chave de API privada ou configuração de production deve ser explicitada aqui.

## 9. Comandos Conhecidos
Encontrados no `package.json`:
- `npm run check:vercel-entrypoints`
- `npm run check:saas-isolation`
- `npm run dev` (roda com `vite --port=3000 --host=0.0.0.0`)
- `npm run build`
- `npm run lint` (`tsc --noEmit` / Typecheck)

## 10. Dívidas Técnicas / Legados / Informações Ausentes
- **Regras Firestore (Firestore Rules):** Existe o arquivo `firestore.rules` mas NÃO VERIFICADO o conteúdo profundo de segurança.
- **Integração Externa:** Não encontrada ou validada integração externa de terceiros (Stripe, etc.) no código investigado.
- **Testes Backend:** Vários scripts de teste presentes na pasta `/scripts/` indicando uso de testes customizados executáveis via `npx tsx scripts/test-xxx.ts`.
- **Billing / Assinaturas:** NÃO VERIFICADO no código analisado (parece ser abstraído pela MillionsNest via `sessionResolve`).

## 11. Universal Capture I1
- A rota frontend `/finance/capture` oferece uma superfície única para câmera, foto, arquivo e, por capability detection, clipboard.
- O intake documental usa as operações `universal-evidence-start` e `universal-evidence-finalize` do gateway financeiro. A organização vem exclusivamente do token Handoff validado e a entidade financeira passa pelo contexto financeiro canônico com a capability existente `finance.create_drafts`.
- O arquivo é vinculado à organização e à `financeEntityId` no momento da seleção. Troca de organização/entidade invalida uma seleção pendente; requisições já iniciadas permanecem vinculadas ao contexto original e respostas stale não retargetam a UI.
- Metadados e índices SHA-256 ficam isolados em `organizations/{organizationId}/financeEntities/{financeEntityId}/universalEvidence` e `universalEvidenceHashes`. O original é enviado por URL autorizada, write-once, sob o mesmo caminho de tenant.
- Retry de upload preserva write-once: somente um HTTP 412 associado à precondition `x-goog-if-generation-match: 0` pode avançar para o `finalize` idempotente; 403/500 e outros erros continuam falhando.
- I1 valida deterministicamente limite de 10 MB, assinatura MIME, SHA-256 e dimensões/orientação básica de imagens. O tamanho real do objeto é validado antes de abrir o stream; WebP cobre VP8, VP8L e VP8X com parsing determinístico.
- I1 não executa OCR, IA, classificação ou qualquer mutação contábil.
- O acesso direto do cliente aos registros e hashes permanece explicitamente negado nas Firestore Rules; criação e finalização são server-mediated.

## 12. Inbox I2A — Evidence Queue
- A rota `/finance/inbox` deixa de ser placeholder e passa a listar evidências reais da `financeEntityId` ativa.
- A leitura usa a operação server-mediated `universal-evidence-list` e exige `finance.view`; a CTA de nova captura é exibida separadamente apenas com `finance.create_drafts`.
- A organização continua derivada do token Handoff validado. O header `x-organization-id` é somente compatibilidade e conflitos com o token falham fechados.
- A consulta é limitada à subcoleção `organizations/{organizationId}/financeEntities/{financeEntityId}/universalEvidence`, ordenada por `createdAt` e paginada por cursor. Não foi criado índice composto novo nem requisito de deploy manual de índice nesta fase.
- O DTO do Inbox é propositalmente mínimo: nome do arquivo, MIME, tamanho, origem, estado, dimensões seguras e timestamps. Não expõe path do Storage, SHA-256 original, UID interno nem `duplicateOfEvidenceId`.
- O resumo do Inbox contabiliza total, aceitos, duplicados e uploads pendentes dentro da mesma entidade financeira.
- A UI possui loading, vazio, erro recuperável, paginação e textos PT/EN/ES; troca de organização/entidade invalida respostas stale.
- I2A continua sem OCR, IA, classificação documental, criação de transação, posting, journal, aggregate, balance ou mutação de Count.
- Preview/download do original e Document Intelligence permanecem fora do I2A e devem entrar apenas em slices posteriores com autorização e auditoria explícitas.

## 13. Inbox I2B — Evidence Detail
- A rota `/finance/inbox/:evidenceId` abre um detalhe somente leitura a partir da fila do Inbox, preservando a entidade financeira ativa.
- A leitura usa a operação server-mediated `universal-evidence-detail` e exige `finance.view` tanto na UI quanto no backend.
- O lookup permanece em `organizations/{organizationId}/financeEntities/{financeEntityId}/universalEvidence/{evidenceId}` e rejeita IDs ausentes ou pertencentes a outra entidade sem revelar a existência cross-entity.
- O DTO é allowlisted e não devolve path do Storage, valor SHA-256, `duplicateOfEvidenceId`, `createdByUid` ou `validatedByUid`.
- O detalhe expõe apenas resultados booleanos das verificações determinísticas já executadas pelo I1: original imutável, MIME verificado, tamanho verificado e conteúdo verificado por hash. O valor do hash não é exposto ao cliente.
- A tela possui loading, erro recuperável, not-found, PT/EN/ES e stale-response guard para troca de organização, entidade ou `evidenceId`.
- I2B não gera URL de download/preview, não lê o binário do Storage, não executa OCR, IA, classificação, criação de transação, posting, journal, aggregate, balance ou mutação de Count.
- Preview seguro do original e Document Intelligence continuam reservados para slices posteriores com política explícita de autorização, custo e auditoria.

## 14. Inbox I2C — Secure Original Preview
- O detalhe da evidência passa a oferecer `Visualizar original` somente para evidências finalizadas (`accepted` ou `duplicate`, versão 2) cujas verificações determinísticas de imutabilidade, MIME, tamanho e hash estejam concluídas.
- A visualização é opt-in: nenhum binário é transferido automaticamente ao abrir o Inbox ou o detalhe. O download acontece somente após ação explícita do usuário.
- A operação server-mediated `universal-evidence-preview` exige `finance.view` e reaplica o mesmo isolamento canônico por organização, `financeEntityId` e `evidenceId`; `organizationId` do body não ganha autoridade.
- O backend não devolve signed read URL nem path do Storage. Ele lê o objeto protegido somente após autorização, limitado a 10 MB, e revalida tamanho, SHA-256, `Content-Type` e assinatura MIME contra a metadata certificada antes de servir qualquer byte.
- A resposta usa `Content-Disposition: inline`, `Cache-Control: private, no-store`, `Pragma: no-cache` e `X-Content-Type-Options: nosniff`; o nome enviado é genérico e não revela o path interno.
- No navegador, o binário vira uma URL `blob:` temporária. Essa URL é revogada ao fechar a visualização, trocar organização/entidade/evidência ou desmontar a tela.
- Imagens são exibidas diretamente e PDFs em frame local do blob; qualquer drift pós-validação de tamanho, hash, MIME ou assinatura falha fechado.
- O custo de Storage/transferência só ocorre quando o usuário solicita o original; não há background job, API paga, OCR ou IA nesse fluxo.
- I2C permanece somente leitura e não cria transação, posting, journal, aggregate, balance, PostingPlan ou mutação de Count.
