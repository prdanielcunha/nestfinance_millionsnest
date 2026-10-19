# Retomar NestFinance — fonte de continuidade

Atualizado em 19/10/2026. Este arquivo registra fatos verificáveis, não um
certificado de que todas as telas ou todos os aparelhos estão homologados.
Leia este arquivo, `AGENTS.md`, `README.md`, `docs/ARCHITECTURE_CURRENT.md` e
os contratos específicos antes de alterar código. Revalide os SHAs remotos:
outros trabalhos do ecossistema podem continuar em paralelo.

Última atualização operacional: os dois índices ausentes foram corrigidos pelo
Hub PR423/424. A certificação `39322937938`, tentativa 2, job `118305810952`,
PASSOU: ambos READY e COUNT/SUM/SUM HTTP200, sem dados reais de uma igreja.
A causa técnica comprovada foi corrigida; o resumo na interface ainda precisa
ser revalidado com uma sessão autenticada. A tentativa segura de login foi interrompida;
não reiniciar pedidos de credenciais automaticamente. A verificação visual
autenticada depende de sessão disponível e não está certificada por este documento.

Incidente intermediário de publicação: a promoção documental PR338 sincronizou
main `4a3ef7e2df5cec138ee2c0f6b606e8dc1012c60c` e production
`ba95e433ef60c6ff38b8b08749f71bc54b990b75` (árvore f8136fab…), mas seu release
`39325536472` parou no guard de Rules antes de publicar a imagem: outra sessão
publicou Hub PR428. O runtime certificado anterior `88d1c8d40ec7` foi preservado.
A atualização focada seguinte fixa o novo hash certificado 5372febb…55f8cd,
sem aceitar hashes arbitrários. Revalidar o último release/endpoint e heads;
uma promoção de branch não comprova por si só que o novo SHA foi servido.

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

- Base certificada antes da última atualização documental deste arquivo:
  main `ff442637099f1a3092a68d390eb5007163e4b5d3`, production
  `88d1c8d40ec7b8cda8ec71c4a8c778cae44f4cf1`, mesma árvore
  `81dee8ed1709ed97354baf68a6e234bf1f8ee80e`. Revalidar os heads remotos;
  a promoção do checkpoint final pode avançar os SHAs sem mudar código runtime.
- PR330/331 publicaram permissões individuais e ajustes responsivos;
  PR332/333 atualizaram o primeiro fingerprint certificado das Rules.
  PR334/335 e promoção PR336 guardaram a continuidade e o novo fingerprint
  certificado do Hub, preservando o cadastro central de outra sessão.
- Promoção PR336: 22 checks frescos aprovados; release Actions `39324214529`,
  job `118305733779`, SUCESSO. Cloud Run, Hosting e domínio oficial confirmaram
  o SHA servido `88d1c8d40ec7`; smoke sem autenticação continuou negado.
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

Fonte da correção de autoridade originalmente certificada:
`f8e53e531169fb658fce646fb7abd241a286af2e343b3a446a8d33f1a17709a9`,
Hub commit `b3fe22ba47604422229577c3ed961598e969fd8b`, Rules run `39239780589`,
job `118017502144`, sucesso e comparação do source publicado. Gates incluíram
114 operações de adulteração negadas, 575 operações financeiras diretas negadas
e 445 verificações Connect contra a fonte realmente publicada, além dos outros apps.
Banco existente `(default)`: STANDARD, FIRESTORE_NATIVE, região nam5, confirmado
por preflight somente leitura `39237708583` / `118010723436`.

Outra sessão publicou o cadastro central (Hub PR425, production
`218cb84c271a49f7ba3569438b843ae3068aad2b`). Sua fonte então certificada era
`cdf3bffa148811de97600fd646ea4fd2331b08c9b7da594d03c680f542c5bf05`,
Rules run `39322376345` / job `118299409689`, sucesso, com 575/114/445 checks
financeiros/autoridade/Connect. Revisão independente confirmou preservação das
proteções financeiras e de acesso. Finance atualiza somente o fingerprint exato
e seu teste; não desfazer esse cadastro ou copiar sua árvore inteira para Hub main.

A fonte atual certificada é Hub PR428, commit
`5fb11db71f57550e9c32617a5da13ecf2bcfd45a`, SHA256
`5372febb59a285e40a567d6caaf5b35ac9ed97f23646e0ffe93959a6bf55f8cd`.
Rules run `39324830021`, job `118307818773`, PASSOU e comparou o source vivo:
114 operações de adulteração e 575 gravações financeiras negadas, 445 checks
Connect repetidos contra a publicação real. A única mudança desde cdf3bffa foi
negar criação direta de pessoas no Journey; proteções Finance/root/members/audit
não mudaram. Production Hub `1efb6939e7ed5525d9eed7378811df6928a3c752` conserva
essa mesma fonte. A revisão independente aprovou o diff e o fingerprint exatos.

Finance mantém esse hash exato como pré-condição de release; nunca aceitar
qualquer hash vivo automaticamente. Não publicar Rules próprias do Finance,
relaxar RBAC, trocar IAM/billing ou restaurar Rules vulneráveis.
Após salvar permissões individuais reais, rollback deve manter o servidor
compatível com o marcador; versão antiga pode devolver herança ampla indevida.

## Resumo Hoje: índices corrigidos; validação autenticada pendente

A revisão autenticada no navegador revelou erro de leitura das prioridades/
resumo, embora a consulta de movimentações abra. Não marcar o aplicativo inteiro
como concluído enquanto isso não for resolvido e revalidado em produção.

Diagnóstico comprovado: índices compostos necessários a SUM(amountCents),
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

As PR421/422 foram mescladas: production `add5b846a4099676ab269e96bd57eb0f8e651a80`,
main `74ec18484c5031054020a4926f5380f133697ba2`. O novo diagnóstico real,
run `39290816826` / job `118190672386`, mostrou COUNT HTTP200 e ambas as SUM
com HTTP400, FAILED_PRECONDITION, requiresIndex:true. Isso comprova os índices
ausentes sem consultar dados de uma igreja real.

Correção Hub PR423/424 revisada e mesclada: production
`c5ca59a5028843233fbe927d1b9dedb3364c6d5b`, main
`d9dbcf727c2a80dbd1019b83adb92ef64f6790af`. Cada branch preserva seus próprios
índices anteriores e adiciona somente dois: financeEntityId + direction +
amountCents e financeEntityId + directionStatus + amountCents (os campos direction
ficam dentro de listQueryKeys), todos ascendentes, collection financeTransactions.
O publisher canônico é `scripts/ensure_nestfinance_summary_indexes.mjs`, com
workflow `nestfinance-summary-indexes.yml`; cria só índices ausentes e aguarda
READY, sem deletar índices/documentos nem alterar IAM/billing. A investigação
isolada agora é manual; a certificação automática faz o probe após READY.

Certificação concluída: run `39322937938`, tentativa 2, job `118305810952`,
sucesso. Os dois índices estavam READY e `status_count`, `direction_sum` e
`direction_status_sum` retornaram HTTP200, code OK, requiresIndex:false.
A tentativa 1 já havia criado ambos, mas a última SUM ainda retornou falta de
índice imediatamente após READY; uma única repetição confirmou a propagação.
Não apagar índices nem reexecutar a criação para "corrigir" esse histórico.
Rules run `39322937778`, job `118301347265`, também PASSOU, incluindo comparação
do source realmente publicado: mesmo hash certificado cdf3bffa…c5bf05.

Próxima validação de produto: reabrir Hoje em sessão autenticada disponível,
sem repetir automaticamente pedidos de login; confirmar resumo/prioridades e
eventuais falhas de Count/Inbox separadamente. Se surgir acesso negado, não
ampliar IAM ou grants de membros reais; registrar o bloqueador real.

## Certificação ainda necessária e continuidade

- A conclusão desta correção técnica NÃO conclui os módulos contábeis restantes.
  A matriz canônica ainda exige contas a pagar/obrigações e liquidações (T18/T19),
  repasse parametrizado com vigência (T26), fechamento/reabertura formal (T27)
  e escrituração/relatórios contábeis completos (T29/T30). Retomar cada entrega
  pelo contrato E01–E08, com PR pequena, testes de integridade/concorrência,
  revisão independente e homologação; não liberar flags para simular conclusão.
  Os registros recebidos e as propostas existentes não devem ser anunciados
  como lançamentos contábeis efetivados ou como um balanço oficial certificado.
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
