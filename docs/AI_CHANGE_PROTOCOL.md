# AI Change Protocol

Este documento define o protocolo rigoroso que deve ser seguido por qualquer IA (incluindo o Google AI Studio) antes, durante e após a execução de qualquer mudança técnica neste repositório.

## PARTE A — ANTES DE ALTERAR

- Ler `AGENTS.md`.
- Ler `ARCHITECTURE_CURRENT.md`.
- Identificar o pedido exato do usuário.
- Definir o que está DENTRO e FORA do escopo solicitado.
- Localizar os arquivos reais no repositório que são relacionados à mudança.
- Localizar dependências diretas e indiretas dos arquivos identificados.
- Verificar riscos de quebra do isolamento Multi-tenant (`organizationId`).
- Verificar riscos de quebra de permissões (RBAC) ou de papéis.
- Verificar riscos associados a lógicas Backend (Express/Vercel) e regras de banco (`firestore.rules`).
- Registrar mentalmente o comportamento atual.
- Definir os critérios de aceite.
- Definir quais validações/testes serão necessários para confirmar a segurança da mudança.

## PARTE B — DURANTE A ALTERAÇÃO

- Fazer as mudanças estritamente mínimas.
- Não alterar arquivos sem necessidade.
- Não modificar contratos públicos (API/Endpoints) sem necessidade comprovada.
- Não duplicar lógica existente; reutilizar contextos, serviços ou componentes quando possível.
- Não confiar apenas no frontend: toda alteração que lide com dados, finanças ou acesso deve ter validação server-side.
- Preservar o isolamento de organização ativa (garantir que `mn_organization_id` ou equivalente seja mantido inviolável).
- Preservar o RBAC atual (não modificar `capabilities` sem autorização explícita).
- Preservar a internacionalização: todo novo texto deve suportar os padrões existentes (Português, English, Español).
- Preservar a responsividade e adaptar para web/mobile.
- Implementar tratamentos de loading (carregamento), estados de sucesso, falha e estado vazio (empty states) quando aplicável.
- Considerar idempotência e concorrência em operações financeiras e críticas de banco.
- Não adicionar logs temporários ou mockups de produção no ambiente real.

## PARTE C — APÓS A ALTERAÇÃO

- Revisar cuidadosamente o diff completo.
- Verificar ativamente se arquivos fora do escopo sofreram alterações indesejadas.
- Executar lint (`npm run lint`).
- Executar typecheck (neste projeto o lint e typecheck estão mesclados em `tsc --noEmit`).
- Executar build (`npm run build`).
- Executar testes relacionados caso existam localmente.
- Verificar erros preexistentes separadamente de erros introduzidos pela alteração.
- Verificar a segurança e coesão da mudança.
- Verificar se o Multi-tenant permaneceu intacto e isolado.
- Verificar as amarras de RBAC e permissões.
- Verificar a internacionalização visual.
- Verificar que o layout não foi quebrado no mobile, tablet e desktop.
- Informar qualquer configuração manual necessária ao desenvolvedor humano.
- Produzir relatório final verificável na resposta para o usuário.

## PARTE D — CRITÉRIOS DE BLOQUEIO

A tarefa **NÃO PODE** ser declarada concluída quando houver:

- Erro de build introduzido pela mudança;
- Erro TypeScript introduzido pela mudança;
- Lint impeditivo introduzido pela mudança;
- Algum teste relacionado falhando;
- Alterações em arquivos fora do escopo inicial;
- Risco de vazamento ou mistura de dados entre organizações;
- Lógica de autorização crítica validada SOMENTE no frontend;
- Algum bypass de segurança via hardcoded;
- Segredos ou credenciais expostas;
- Sistema de billing ou entitlements duplicado ou manipulado;
- Texto em tela sem suporte à arquitetura de internacionalização;
- Ausência de tratamento de erros, empty states ou falhas de rede num fluxo crítico;
- Ausência de validação no backend;
- Ausência de evidência que afirme que testes ou builds foram realmente executados com sucesso;
- Configuração ou script manual que foi omitida da comunicação com o usuário.
