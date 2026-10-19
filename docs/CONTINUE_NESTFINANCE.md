# Retomar NestFinance — fonte de continuidade

Atualizado em 19/10/2026. Este arquivo registra fatos verificáveis, não um
certificado de que todas as telas ou todos os aparelhos estão homologados.
Leia este arquivo, `AGENTS.md`, `README.md`, `docs/ARCHITECTURE_CURRENT.md` e
os contratos específicos antes de alterar código. Revalide os SHAs remotos:
outros trabalhos do ecossistema podem continuar em paralelo.

## Objetivo e autorização do usuário

Finalizar o aplicativo para os cultos e a tesouraria, publicar em produção e
sincronizar com main, sem novos serviços pagos, sem estragar dados ou outros
aplicativos. Continuar autonomamente com testes/revisão; não repetir um loop de
login. Se esta sessão acabar, outro chat deve prosseguir do estado remoto.
Não alterar permissões de membros reais para testar nem inventar lançamentos.

Decisões de produto confirmadas:

- Contagem do culto prioriza dinheiro físico, com duas pessoas e conferência
  independente. Pix/cartão podem ser registrados depois, pela pessoa autorizada,
  usando a data real de recebimento; não reabrir a contagem nem duplicar receita.
- Saldo só pode ser visto por quem tem autorização efetiva no servidor.
  Contar, registrar, conferir, aprovar, ver saldo e administrar são tarefas
  distintas, explicadas em linguagem simples para pessoas leigas.
- Interface responsiva para celular/tablet/PC; claro e escuro persistentes.
- Correções exigem autoria, motivo, data/hora e antes/depois, preservando história.
  Engenharia não pode aprovar lançamentos/contagens ou decisões humanas pelo usuário.

## Repositórios e produção já certificados

NestFinance: `prdanielcunha/nestfinance_millionsnest`.
Domínio: `https://nestfinance.millionsnest.com`.
Runtime: Firebase Hosting + Cloud Run `nestfinance-api`, projeto `millionsnest`.

- Main certificado: `b087849cdb882202c4b143476a8cc6fc485fb502`.
- Production certificado: `1d3daf321474b67504c08444c85120e83f59148f`.
- Ambos tinham árvore `85aa3519c11a0808dd4fe5b2563030660ef43012` antes deste
  checkpoint documental. PR330/331 publicaram permissões individuais e ajustes
  responsivos; PR332/333 atualizaram o fingerprint certificado das Rules.
- Release final confirmado: Actions `39240755003`, job `118020701816`, sucesso.
- Endpoint público de versão: `/api/system/release`.
- Smoke sem autenticação: POST
  `/api/finance-gateway?operation=transactions-summary`, JSON com
  `financeEntityId` sintético, deve retornar 401; nunca um saldo.

Hub canônico: `prdanielcunha/millionsnest`.

- Editor publicado por PR415, production `1e31eb9ce5e2f4222af887dfdc65c1d396de2dad`;
  Cloud Run `millionsnest-api-r39240274579`, publicação Actions `39240274579` com sucesso.
- GET/PATCH `/api/v1/organizations/:organizationId/members/:memberId/nestfinance-access`
  retornaram 401 sem autenticação no domínio público do Hub.
- Localização: organização → Membros e Convites → Permissões do NestFinance.
- Código principal: `src/server/services/NestFinanceMemberAccessCommandService.ts`,
  `src/components/NestFinanceMemberAccessEditor.tsx`, `src/lib/withAbortDeadline.ts`.
- Main e production do Hub já possuíam diferenças de outros produtos. Aplicar
  mudanças focadas nas duas linhas; não substituir uma árvore inteira pela outra.

## Segurança que não pode regredir

`finance.access.individual_v1` é opt-in, salvo somente pelo comando canônico do
Hub. Membros marcados usam permissões explícitas em vez de herdar acesso amplo
pelo título/cargo. Count não recebe permissão genérica de criar lançamentos.
Cada alteração audita antes/depois/motivo e incrementa a versão canônica de sessão.
Não houve migração automática nem gravação de permissões de membros reais.

Rules compartilhadas são publicadas SOMENTE pelo Hub. PR417/418 corrigiram dois
caminhos de gravação direta que contornavam a autoridade. Memberships canônicas
e espelhos legados são gravados pelo servidor; a proteção de perfil raiz não
pode ser anulada por wildcard recursivo. Evidência de mudanças de acesso não
pode ser adulterada pelo SDK do navegador.

Fonte exata publicada/certificada:
`f8e53e531169fb658fce646fb7abd241a286af2e343b3a446a8d33f1a17709a9`.
Hub commit `b3fe22ba47604422229577c3ed961598e969fd8b`, Rules run `39239780589`,
job `118017502144`, sucesso e comparação do source publicado. Gates incluíram
114 operações de adulteração negadas, 575 operações financeiras diretas negadas
e 445 verificações Connect contra a fonte realmente publicada, além dos outros apps.
Banco existente `(default)`: STANDARD, FIRESTORE_NATIVE, região nam5, confirmado
por preflight somente leitura `39237708583` / `118010723436`.

Finance mantém esse hash exato como pré-condição de release; nunca aceitar
qualquer hash vivo automaticamente. Não publicar Rules próprias do Finance,
relaxar RBAC, trocar IAM/billing ou restaurar Rules vulneráveis.
Após salvar permissões individuais reais, rollback deve manter o servidor
compatível com o marcador; versão antiga pode devolver herança ampla indevida.

## Bloqueador ativo: resumo Hoje não carrega

A revisão autenticada no navegador revelou erro de leitura das prioridades/
resumo, embora a consulta de movimentações abra. Não marcar o aplicativo inteiro
como concluído enquanto isso não for resolvido e revalidado em produção.

Hipótese em investigação: índices compostos necessários a SUM(amountCents),
com filtro `financeEntityId` e faixa `listQueryKeys.direction` ou
`listQueryKeys.directionStatus`. O Emulator não exige todos os índices de produção.

Comportamento/código:

- `server/vercel-handlers/finance/transactionsSummary.ts` usa agregações e contas
  do repositório scoped; `accessHelpers.ts` adiciona o filtro `financeEntityId`.
- `src/services/transactionsService.ts` → operação `transactions-summary`.
- `src/pages/finance/TodayActionCenter.tsx` agrega falhas de resumo, contagem e Inbox;
  investigar qual consulta falha, sem transformar erro em zero ou esconder falhas.
- Um chunk antigo da página Mais falhou após publicação; um reload resolveu a
  página, mas NÃO resolveu o resumo. Não confundir os dois problemas.

Diagnóstico já versionado no Hub:

- PR419/420 mescladas: production `c554a9da8c4b19ab3a92f6a5df018a797adb3ec4`,
  main `a620e82775865180dea59ae96d853d069c8095ff`.
- Workflow `nestfinance-summary-index-preflight.yml`, script
  `scripts/probe_nestfinance_summary_indexes.mjs`: usa WIF existente, lê metadados
  e consulta SOMENTE um caminho sintético inexistente, com limite 1. Não escreve
  documentos/índices e não imprime payloads de clientes, credenciais ou erro bruto.
- Run `39290080286`, job `118188143969`: COUNT HTTP200; duas SUM HTTP400.
  Isso ainda NÃO prova falta de índice: o primeiro parser não reconhecia erros
  REST em array e informou code OK indevidamente. Não repetir essa conclusão.
- PR421 (production) e PR422 (main) corrigem a classificação, com testes de
  stream/object, falta de índice, acesso negado, HTTP desconhecido e ocultação de
  detalhes. Heads candidatos: `56b1fb4ee71812e25810de013fb85be7af4533ff` e
  `3fe13c7593327de202276d74b34df3bd44f82977`. Revalidar estado/CI antes de mesclar.

Próxima ação concreta: concluir CI/revisão das PR421/422, mesclar, ler o novo
resultado do diagnóstico em produção. Exigir `FAILED_PRECONDITION` com
`requiresIndex:true` antes de concluir falta de índice. Se for acesso negado,
não ampliar IAM automaticamente. Se índices forem comprovadamente ausentes,
versionar só os mínimos no Hub e usar criação aditiva/idempotente que preserve
os índices dos demais aplicativos. Reutilizar o padrão
`scripts/ensure_nestjourney_indexes.mjs`; não fazer deploy destrutivo do manifesto.
Revisão independente + testes + prova READY + repetição das consultas obrigatórios.

## Certificação ainda necessária e continuidade

- Reabrir Hoje autenticado, conferir resumo e estados reais; não gravar dados
  financeiros para fazer um teste passar. Conferir Count, registro digital e
  acesso restrito em testes sintéticos/emulador, nunca concedendo acesso real.
- Navegador mostrou telas reais em largura aproximada de 485px, sem overflow
  horizontal na consulta. Claro/escuro e página Seus acessos foram observados.
  Não houve homologação física em todos os iPhones/iPads/Android/PCs. Não chamar
  build/SSR de aceitação visual completa. Login depende da sessão disponível;
  se houver bloqueio real, usar o fluxo seguro e não tentar indefinidamente.
- Ler `docs/NESTFINANCE_20261015_32_TELAS_GATES_EXECUCAO.md` e os contratos dos
  módulos. A matriz T01–T32 é rastreamento, não certificado. Não ligar posting,
  OCR/IA paga ou fechamento formal como efeito colateral para simular completude.
- `docs/RECEIVED_INCOME_20261017.md`, `CASH_FIRST_DIGITAL_INCOME_THEMES_20261018.md`,
  `INDIVIDUAL_MEMBER_ACCESS_20261019.md` detalham implementação e limites.
- Testes específicos existentes: `test-cash-first.ts`,
  `test-count-legacy-received-date.ts`, `test-individual-finance-access-emulator.ts`,
  `test-transactions-summary-firestore-emulator.ts`; usar projeto Emulator `demo-*`.
- Rodar gates do `package.json`/workflows aplicáveis, lint e builds, revisão
  independente exigida pela política do Hub; promover por PR com SHA esperado.
  Publicação iniciada/PR mesclada não equivalem à versão servida: verificar Actions,
  release endpoint e HTTP401 sem autenticação depois do deploy.
- Se o workspace transitório sumir, clonar os repositórios novamente; tudo que
  está no GitHub é recuperável. Não presumir que arquivos locais antigos existem.

Não declarar “100% pronto” com resumo falhando, CI pendente ou só testes de layout
por código. Atualizar este checkpoint com as novas evidências ao concluir cada etapa.
