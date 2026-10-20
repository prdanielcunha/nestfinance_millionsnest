# Livros contábeis — consulta e exportações

## Entrega

Operação `certified-book-report`, somente leitura. Consulta um mês no livro certificado, em snapshot transacional consistente. Antes de retornar, exige contexto canônico de tesouraria, `finance.balance.view` e `finance.accountant.view_exports`. Não aceita lançamentos enviados pelo navegador.

A leitura existente verifica o total exato de lançamentos persistidos, integridade do diário, aberturas e igualdade entre projeção bancária e livro. Divergência, abertura ausente ou mais de 5.000 lançamentos recusam a consulta inteira; não há total parcial apresentado como completo. A projeção pública omite UIDs de autores/aprovadores, recibos privados e caminhos de evidências.

A tela Relatórios oferece Balancete, Diário, Razão com filtro por conta, paginação de 25 linhas e detalhe de cada lançamento. A consulta é explícita, cancelável e reinicia ao trocar organização, entidade ou mês. PT/EN/ES, tokens visuais existentes, tabelas roláveis e botões operacionais. Os CSVs exportam todas as linhas da visão, independentemente da página/filtro visual. JSON reúne os três livros e metadados de cobertura. Labels não confiáveis são protegidos contra fórmulas em planilhas; centavos, sinais, aspas e delimitadores são preservados.

Os livros descrevem a escrituração preparada no NestFinance. A interface explica que rascunhos, pagamentos ainda não registrados e dados antigos não migrados ficam de fora. Não afirma emitir ou assinar demonstrativos oficiais. Não confundir essa consulta com fechamento formal, migração de histórico ou homologação profissional/fiscal.

## Evidências novas

- HTTP em Firestore Emulator `demo-*`: livros completos iguais ao motor, estorno ligado ao original, todos os CSVs, nenhuma exposição de UID interno, permissões de saldo/exportação independentes, perfil individual explicitamente autorizado, negativa Count/sem token/outra organização, mês inválido e cobertura inconsistente sem totais.
- Exportação: tentativas de fórmula com espaços/tab/newline, aspas e delimitadores, centavos e valores negativos em PT/EN/ES, 101 linhas além da primeira página e recusa de valor inválido.
- TypeScript, frontend build, Cloud Run build, contratos de API e isolamento SaaS (184 arquivos) passaram localmente.
- Revisão React: abort de requisições, desmontagem por contexto/mês, nenhuma busca automática de saldos, paginação, estado vazio/erro/loading e autorização preservada no servidor.

Validação visual autenticada continua bloqueada pela ausência de sessão no navegador; não houve simulação de login nem teste físico em aparelhos. A publicação deve esperar os checks reais da PR.

## Próximas pendências do pedido integral

Posting/estorno da movimentação comum pela interface; regras de repasse versionadas e sua obrigação; fechamento/reabertura com snapshot imutável e barreira em todos os escritores; recorrência e migração histórica de contas a pagar. A base de pagamentos da PR344 é pré-requisito desta entrega.
