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
- `/finance`: Dashboard principal (`Hoje`).
- `/finance/transactions`: Lista de movimentações (transactions).
- `/finance/capture`: Universal Capture documental.
- `/finance/inbox`: Fila server-mediated de documentos e evidências da entidade financeira ativa.
- `/finance/inbox/:evidenceId`: Detalhe protegido de uma evidência da entidade financeira ativa.
- `/finance/settings`: Configurações (com sub-rotas para accounts, entities, funds, categories).

## 6. Fluxo de Autenticação, Handoff e RBAC
- **Autenticação:** Gerenciada pelo Firebase Auth via `useAuth.ts`. Ao detectar login, o NestFinance resolve o acesso canônico pelo backend em `/api/auth/session/resolve`.
- **Handoff:** `/auth/handoff` aceita um código URL-safe de 43 caracteres, remove-o da URL, envia somente `{ code }` para `/api/auth/handoff/redeem` e, após resgate válido, usa `signInWithCustomToken()`.
- **Resgate server-side:** `handoffRedeem.ts` calcula SHA-256 do código, consulta `ecosystemHandoffs/{codeHash}`, valida app/version/status/expiração/contexto e consome o registro atomicamente antes de emitir o Firebase Custom Token.
- **Claims do Custom Token:** incluem `mn_app_id`, `mn_organization_id`, `mn_handoff_version` e `mn_access_source`. O contexto de organização vem do Handoff armazenado server-side, não do body arbitrário do cliente.
- **Resolução de Organização Ativa:** `mn_organization_id` é usado como contexto autenticado e a organização é revalidada no backend. NUNCA aceitar cegamente `organizationId`, roles, permissions ou scopes apenas do frontend/URL.
- **Resolução de Permissões (RBAC):** feita no backend em `/api/_lib/ecosystemSessionResolver.ts`.
  - **Papéis globais canônicos:** somente `ceo`, `global_admin`, `ecosystem_owner` e `founder` podem representar autoridade global de ecossistema (`isGlobalAccess: true`).
  - **Gate atual de desenvolvimento do NestFinance:** atualmente permite acesso apenas a `ceo`, `global_admin` e `ecosystem_owner`. `founder` permanece no vocabulário global canônico, mas não passa o gate temporário de desenvolvimento atual.
  - **Papéis organizacionais:** `owner`, `admin`, pastor/líder e equivalentes organizacionais NÃO são papéis globais do ecossistema.
  - **Membership canônica do resolver:** quando o gate de desenvolvimento for ampliado, o resolver usa `organizations/{orgId}/members/{uid}`; coleções legadas como `organization_members` não são fontes de autorização do resolver canônico.
  - **Acesso por membership:** exige organização ativa, `enabledApps` contendo `nestfinance`, entitlement ativo e `appAccess.nestFinance.enabled === true`; permissões/scopes vêm desse bloco server-side.
- O Frontend reflete o estado resolvido através de Boundaries (`AuthBoundary`, `EcosystemAccessBoundary`, `OrganizationalAccessBoundary`) e checagens de capabilities.
- O contrato cross-app completo do Handoff ainda possui pendências documentadas em `Pending-Integration-Contract.md` (por exemplo `sessionVersion`, rate limit, App Check, política de origem/CORS, logout e troca de organização).

## 7. Modelagem Firestore
Coleções e subcoleções relevantes confirmadas no código atual:
- `users/{uid}`: perfil e `systemRole` canônico.
- `organizations/{orgId}`: organização e configuração de apps/entitlements.
- `organizations/{orgId}/members/{uid}`: membership canônica usada pelo resolver de sessão.
- `ecosystemHandoffs/{codeHash}`: registros server-side de Handoff consultados por SHA-256 do código e consumidos atomicamente.
- `organizations/{orgId}/financeSettings`: configurações financeiras.
- `organizations/{orgId}/financeAccounts`: contas financeiras.
- `organizations/{orgId}/financeCategories`: categorias de despesas/receitas.
- `organizations/{orgId}/financeFunds`: fundos/reservas.
- `organizations/{orgId}/financeEntities/{financeEntityId}`: boundary do livro financeiro por entidade.
- `organizations/{orgId}/financeEntities/{financeEntityId}/universalEvidence`: evidências documentais da entidade.
- `organizations/{orgId}/financeEntities/{financeEntityId}/universalEvidenceHashes`: índice de hashes das evidências.
- `organizations/{orgId}/financeTransactions`: registros do workflow de movimentações financeiras.
- Outras coleções financeiras server-mediated incluem journal, aggregates, audit/idempotency e estruturas auxiliares conforme os handlers/schemas atuais.

As Firestore Rules mantêm deny-by-default e tratam coleções financeiras sensíveis como server-only para o cliente. O helper `isSystemAdmin()` das Rules usa somente `ceo`, `global_admin`, `ecosystem_owner` e `founder`; `owner` organizacional não concede autoridade global.

**Posting real:** o produto possui estados como `approved_for_posting`, preview/PostingPlan e registros financeiros intermediários, mas não deve ser documentado como tendo posting contábil real habilitado. A promoção para posting real continua fora do boundary certificado atual.

## 8. Variáveis de Ambiente
Utilizadas ou confirmadas no código atual incluem:
- `NESTFINANCE_SESSION_RESOLVE_ENABLED` (usada no `sessionResolve.ts`).
- `NESTFINANCE_HANDOFF_REDEEM_ENABLED` (feature flag do resgate de Handoff).
Nenhum segredo de banco, chave de API privada ou configuração sensível de production deve ser explicitado aqui.

## 9. Comandos Conhecidos
Encontrados no `package.json` e workflows:
- `npm run check:vercel-entrypoints`
- `npm run check:saas-isolation`
- `npm run dev` (roda com `vite --port=3000 --host=0.0.0.0`)
- `npm run build`
- `npm run lint` (`tsc --noEmit` / Typecheck)
- gates específicos de Universal Evidence/Document Intelligence são executados por scripts `test-universal-evidence-*` nos workflows certificados.

## 10. Dívidas Técnicas / Legados / Informações Ausentes
- **Contrato Handoff cross-app:** o resgate no NestFinance está implementado; emissão/TTL no Hub, `sessionVersion`, rate limit, App Check, política de origem/CORS, logout, troca de organização, retorno ao Hub e auditoria durável ainda exigem reconciliação/certificação coordenada. Ver `Pending-Integration-Contract.md`.
- **Gate de desenvolvimento:** o resolver e as Rules restringem temporariamente o NestFinance a `ceo`, `global_admin` e `ecosystem_owner`; a abertura para memberships organizacionais deve ser um slice explícito e certificado.
- **Firestore Rules vs. legados:** as Rules ainda contêm helpers de compatibilidade para memberships/roles legados em áreas gerais do ecossistema; isso não deve ser confundido com a membership canônica usada pelo resolver NestFinance.
- **Posting real:** permanece desativado/fora do contrato certificado; aprovação para posting e preview não equivalem a lançamento real.
- **Billing / Assinaturas:** não é responsabilidade implementada diretamente neste app; entitlement é consumido do contexto MillionsNest.
- **Proteção de branches:** a proteção técnica de `main`/`production` no GitHub deve ser tratada como governança de repositório separada da arquitetura de runtime.

## 11. Universal Capture I1
- A rota frontend `/finance/capture` oferece uma superfície única para câmera, foto, arquivo e, por capability detection, clipboard.
- O intake documental usa as operações `universal-evidence-start` e `universal-evidence-finalize` do gateway financeiro. A organização vem exclusivamente do contexto autenticado validado e a entidade financeira passa pelo contexto financeiro canônico com a capability existente `finance.create_drafts`.
- O arquivo é vinculado à organização e à `financeEntityId` no momento da seleção. Troca de organização/entidade invalida uma seleção pendente; requisições já iniciadas permanecem vinculadas ao contexto original e respostas stale não retargetam a UI.
- Metadados e índices SHA-256 ficam isolados em `organizations/{organizationId}/financeEntities/{financeEntityId}/universalEvidence` e `universalEvidenceHashes`. O original é enviado por URL autorizada, write-once, sob o mesmo caminho de tenant.
- Retry de upload preserva write-once: somente um HTTP 412 associado à precondition `x-goog-if-generation-match: 0` pode avançar para o `finalize` idempotente; 403/500 e outros erros continuam falhando.
- I1 valida deterministicamente limite de 10 MB, assinatura MIME, SHA-256 e dimensões/orientação básica de imagens. O tamanho real do objeto é validado antes de abrir o stream; WebP cobre VP8, VP8L e VP8X com parsing determinístico.
- I1 não executa OCR, IA, classificação ou qualquer mutação contábil.
- O acesso direto do cliente aos registros e hashes permanece explicitamente negado nas Firestore Rules; criação e finalização são server-mediated.

## 12. Inbox I2A — Evidence Queue
- A rota `/finance/inbox` lista evidências reais da `financeEntityId` ativa.
- A leitura usa a operação server-mediated `universal-evidence-list` e exige `finance.view`; a CTA de nova captura é exibida separadamente apenas com `finance.create_drafts`.
- A organização continua derivada do contexto autenticado. O header `x-organization-id` é somente compatibilidade e conflitos com o token falham fechados.
- A consulta é limitada à subcoleção `organizations/{organizationId}/financeEntities/{financeEntityId}/universalEvidence`, ordenada por `createdAt` e paginada por cursor.
- O DTO do Inbox é propositalmente mínimo e não expõe path do Storage, SHA-256 original, UID interno nem `duplicateOfEvidenceId`.
- A UI possui loading, vazio, erro recuperável, paginação e textos PT/EN/ES; troca de organização/entidade invalida respostas stale.
- I2A continua sem OCR, IA, classificação documental, criação de transação, posting, journal, aggregate, balance ou mutação de Count.

## 13. Inbox I2B — Evidence Detail
- A rota `/finance/inbox/:evidenceId` abre um detalhe somente leitura a partir da fila do Inbox, preservando a entidade financeira ativa.
- A leitura usa a operação server-mediated `universal-evidence-detail` e exige `finance.view` tanto na UI quanto no backend.
- O lookup permanece em `organizations/{organizationId}/financeEntities/{financeEntityId}/universalEvidence/{evidenceId}` e rejeita IDs ausentes ou pertencentes a outra entidade sem revelar a existência cross-entity.
- O DTO é allowlisted e não devolve path do Storage, valor SHA-256, `duplicateOfEvidenceId`, `createdByUid` ou `validatedByUid`.
- O detalhe expõe apenas resultados booleanos das verificações determinísticas já executadas pelo I1: original imutável, MIME verificado, tamanho verificado e conteúdo verificado por hash.
- A tela possui loading, erro recuperável, not-found, PT/EN/ES e stale-response guard para troca de organização, entidade ou `evidenceId`.
- I2B permanece sem preview automático, OCR, IA, classificação ou mutação financeira.

## 14. Inbox I2C — Secure Original Preview
- O detalhe da evidência oferece `Visualizar original` somente para evidências finalizadas (`accepted` ou `duplicate`, versão 2) cujas verificações determinísticas de imutabilidade, MIME, tamanho e hash estejam concluídas.
- A visualização é opt-in: nenhum binário é transferido automaticamente ao abrir o Inbox ou o detalhe.
- A operação server-mediated `universal-evidence-preview` exige `finance.view` e reaplica o isolamento canônico por organização, `financeEntityId` e `evidenceId`; `organizationId` do body não ganha autoridade.
- O backend não devolve signed read URL nem path do Storage. Ele lê o objeto protegido somente após autorização, limitado a 10 MB, e revalida tamanho, SHA-256, `Content-Type` e assinatura MIME contra a metadata certificada antes de servir qualquer byte.
- A resposta usa `Content-Disposition: inline`, `Cache-Control: private, no-store`, `Pragma: no-cache` e `X-Content-Type-Options: nosniff`.
- No navegador, o binário vira uma URL `blob:` temporária, revogada ao fechar a visualização, trocar organização/entidade/evidência ou desmontar a tela.
- Imagens são exibidas diretamente e PDFs em frame local do blob; qualquer drift pós-validação de tamanho, hash, MIME ou assinatura falha fechado.
- O custo de Storage/transferência só ocorre quando o usuário solicita o original; não há background job, OCR ou IA nesse fluxo.
- I2C permanece somente leitura e não cria transação, posting, journal, aggregate, balance, PostingPlan ou mutação de Count.

## 15. Inbox I2D — Deterministic PDF Intelligence Foundation
- I2D adiciona inspeção server-side determinística para PDFs finalizados e verificados, com a finalidade exclusiva de avaliar se a estrutura parece adequada para um caminho futuro de texto nativo.
- Exige `finance.view`, organização/entidade/evidência canônicas, evidência v2 `accepted`/`duplicate`, MIME PDF e revalidação do original imutável (tamanho, SHA-256, MIME e assinatura PDF).
- O resultado de `textLayerState` é `detected`, `not_detected` ou `unknown`; `not_detected` significa somente “não detectado pelo parser determinístico I2D”, nunca prova de ausência de texto.
- O parser suporta subset deliberadamente estreito (streams raw e Flate simples) e falha fechado para `unknown` diante de estruturas ambíguas/unsupported ou limites excedidos.
- Limites principais: até 256 streams, lookback de 16 KiB e limites de 2 MiB para stream Flate comprimido/inflado.
- I2D não extrai texto, não usa OCR/IA, não classifica documento, não reconhece campos financeiros e não realiza mutação contábil.
- Contrato detalhado: `docs/UNIVERSAL_EVIDENCE_I2D_PDF_INTELLIGENCE.md`.

## 16. Inbox I2E — PDF Text Readiness UX
- I2E expõe o sinal I2D na tela de detalhe sem criar novo parser ou operação backend.
- A análise é opt-in e só ocorre após ação explícita do usuário; abrir a evidência não dispara inspeção.
- A UI preserva exatamente as semânticas `detected` / `not_detected` / `unknown`, com PT/EN/ES e stale-response guard.
- I2E não extrai texto, não usa OCR/IA, não persiste resultado e não realiza qualquer mutação financeira.
- Contrato detalhado: `docs/UNIVERSAL_EVIDENCE_I2E_PDF_READINESS.md`.

## 17. Inbox I2F — Native PDF Text Extraction Foundation
- I2F adiciona foundation determinística e bounded para extrair texto já embutido em PDFs elegíveis, sem nova API ou UI nesta fase.
- Usa `unpdf@1.8.1`/PDF.js serverless e processa páginas individualmente.
- Antes da extração, exige preflight I2D compatível e text layer detectada.
- Limites certificados: input de até 4 MiB, até 40 páginas, até 100.000 caracteres retornados e `maxImageSize` de 4.194.304 pixels; imagens não são renderizadas nem extraídas.
- `state = extracted` representa texto nativo obtido sob esses limites; `state = unavailable` falha fechado com reason machine-readable.
- I2F não interpreta financeiramente o texto, não persiste conteúdo, não usa OCR/IA e não altera dados financeiros.
- Contrato detalhado: `docs/UNIVERSAL_EVIDENCE_I2F_NATIVE_PDF_TEXT.md`.

## 18. Inbox I2G — Protected Native PDF Text API
- I2G expõe o extractor I2F através do gateway financeiro em `POST universal-evidence-pdf-text`.
- Requer `finance.view`; o request contém somente `financeEntityId` e `evidenceId`, e a organização é resolvida pelo contexto autenticado canônico.
- Revalida evidência v2 finalizada, original imutável, tamanho, hash, MIME e assinatura antes da extração; metadata acima de 4 MiB falha antes de qualquer Storage read.
- A resposta é `private, no-store`, não expõe Storage path/hash e declara `deterministic: true`, `aiUsed: false`, `ocrUsed: false`, `financialRecognition: false`.
- I2G é somente leitura e não persiste texto nem cria/muta transações ou posting.
- Contrato detalhado: `docs/UNIVERSAL_EVIDENCE_I2G_NATIVE_PDF_TEXT_API.md`.

## 19. Inbox I2H — Native PDF Text UX
- I2H expõe I2G no detalhe da evidência após o step de readiness I2E.
- O botão de leitura só aparece quando a readiness determinística indica text layer detectada, PDF não criptografado, sem streams não suportados e sem limite estrutural.
- Não há extração em page load/useEffect; o usuário precisa clicar explicitamente.
- O texto é mantido somente em memória do componente, renderizado como texto React inerte e descartado ao mudar organização/entidade/evidência.
- PT/EN/ES, truncation e contagem de páginas/caracteres são explícitos.
- I2H não adiciona OCR, IA, persistência, classificação ou mutação financeira.
- Contrato detalhado: `docs/UNIVERSAL_EVIDENCE_I2H_NATIVE_PDF_TEXT_UX.md`.

## 20. Inbox I2I — Deterministic Text Signals Foundation
- I2I inicia Document Intelligence Layer 1 sobre texto nativo já disponível, usando somente parsers determinísticos locais.
- Reconhece candidatos bounded de CNPJ, CPF, datas explícitas, valores explicitamente marcados por `R$`/`BRL`, Pix com label explícita e padrões de boleto/barcode de 44/47/48 dígitos.
- Cada candidato preserva `kind`, evidência raw, valor normalizado, offsets, contexto e força de evidência (`validated`, `explicit_label` ou `pattern_only`).
- Limites: até 100.000 caracteres de entrada e até 100 candidatos, com `limited=true` quando aplicável.
- Candidatos não são fatos contábeis; não há API, UI, Firestore/browser persistence, OCR, IA, lookup externo ou mutação financeira nessa foundation.
- Contrato detalhado: `docs/UNIVERSAL_EVIDENCE_I2I_DETERMINISTIC_TEXT_SIGNALS.md`.

## 21. Inbox I2J — Deterministic Text Signals UX
- I2J expõe I2I somente depois do read protegido I2G/I2H e de um segundo clique explícito em **Analyze signals**.
- O parser roda local e sincronamente sobre o texto que já está autorizado e em memória; nenhum novo endpoint é chamado.
- Os resultados são apresentados como **review candidates**, com força de evidência e limitações visíveis, nunca como dados financeiros confirmados.
- Troca de contexto remove o texto/sinais anteriores; contexto e excerpts são renderizados como texto inerte.
- I2J adiciona zero server call, OCR, IA, model token, banco, lookup ou mutação financeira.
- Contrato detalhado: `docs/UNIVERSAL_EVIDENCE_I2J_DETERMINISTIC_TEXT_SIGNALS_UX.md`.

## 22. Inbox I2K — Deterministic Field Role Hints Foundation
- I2K adiciona uma camada semântica conservadora sobre os candidatos I2I, sem criar novos fatos extraídos.
- `roleHint` só é atribuído quando existe label explícita, compatível e na mesma linha, imediatamente antes do candidato dentro do boundary de 96 caracteres.
- Vocabulário inicial: `issue_date`, `due_date`, `total_amount`, `issuer_tax_id`, `recipient_tax_id`, `payment_code` e `pix_key`.
- Labels genéricas/ambíguas, distantes ou incompatíveis permanecem sem role.
- Metadata de review preserva `semanticState: unconfirmed`, `requiresConfirmation: true`, `source: native_text`, `derivedBy: deterministic_rule`, `ocrUsed: false`, `aiUsed: false`, `userConfirmed: false`.
- I2K não tem API/UI/persistência e não salva, aprova, classifica, reconcilia ou posta nada.
- Contrato detalhado: `docs/UNIVERSAL_EVIDENCE_I2K_DETERMINISTIC_FIELD_ROLE_HINTS.md`.

## 23. Inbox I2L — Deterministic Field Role Hints UX
- I2L renderiza os role hints I2K dentro do painel I2J, preservando como conceitos separados a validade do sinal e o possível papel semântico daquele valor.
- Quando existe role sugerida, a UI mostra role possível, label explícita que sustentou a regra e requisito de confirmação humana.
- Quando não existe role, a UI declara explicitamente que o significado semântico não foi determinado automaticamente.
- PT/EN/ES cobre todos os roles do vocabulário inicial.
- I2L executa I2I uma vez e I2K uma vez por ação explícita, tudo em memória, sem rede/persistência/OCR/IA.
- Não existe nesta fase botão/contrato de confirmar, salvar ou aplicar uma decisão humana. `requiresConfirmation: true`, `semanticState: unconfirmed` e `userConfirmed: false` continuam intactos.
- Confirmação durável pertence a um futuro **Review Workspace**, que deverá possuir autorização, auditoria e contrato de escrita próprios.
- Contrato detalhado: `docs/UNIVERSAL_EVIDENCE_I2L_DETERMINISTIC_FIELD_ROLE_HINTS_UX.md`.

## 24. Boundary Certificado Atual e Próximo Passo
O estado certificado atual do Document Intelligence termina em I2L.

Invariantes que devem permanecer até um slice posterior explicitamente aprovado:
- nenhuma análise documental automática em page load/background;
- deterministic-first;
- nenhum OCR ou IA no fluxo I2D–I2L;
- nenhum texto/candidato/role hint persistido como fato financeiro;
- nenhuma confirmação humana durável ainda implementada;
- nenhuma criação/aplicação automática de transação, journal, balance, aggregate, PostingPlan ou Count;
- posting real permanece fora do boundary certificado;
- isolamento por organização + `financeEntityId` + `evidenceId` continua obrigatório;
- PT/EN/ES e estados de incerteza devem permanecer explícitos.

O próximo boundary funcional natural é um **Review Workspace** separado, capaz de registrar confirmação humana com autorização, trilha de auditoria e contrato de escrita próprio. Esse passo não deve ser inferido como existente apenas porque I2K/I2L já fornecem sugestões semânticas.
