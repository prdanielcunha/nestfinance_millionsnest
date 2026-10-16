# NestFinance — Matriz de rastreabilidade 16/10/2026 (em execução)

> Fonte: **NestFinance_Especificacao_Detalhada_Telas_Funcoes_IA_2026-10-15(3).docx** (T01–T32; E01–E08), imagem aprovada de Hoje / Contagem / Conferência e Product Experience Standard.
>
> **IMPORTANTE:** existência de rota, interface ou teste unitário não equivale a homologação. A especificação afirma que somente o login havia sido observado visualmente. Status **NÃO CERTIFICADO** até evidência de fluxo real, autorização server-side, PT/EN/ES, acessibilidade, estados e teste desktop/mobile. Não são dados de produção.

## Ordem de execução por risco

- **P0:** contratos canônicos Hub, isolamento por organização/entidade, capacidades finas, proteção explícita de saldo e compatibilidade de clientes.
- **P1:** equipe variável, participantes físicos/digitais, política por igreja, conferências independentes N ou acompanhadas, fluxo até propostas.
- **P2:** tokens/tema/navegação/Hoje alinhados à referência, captura/entrada/despesa/obrigações.
- **P3:** abertura datada, efetivação certificada, razão/saldo, transferências/conciliação; repasse/fechamento/relatórios/contador.
- **P4:** matriz completa de testes, visual real, acessibilidade, dispositivos, deploy/rollback e evidência de produção.

## Telas (cada linha exige: função + autorização + dados + loading/empty/error/success + PT/EN/ES + acessibilidade + mobile/desktop)

| Tela | Entrega | Escopo | Certificação |
| --- | --- | --- | --- |
| T01 | E03 | Entrada e sessão Hub / Google | NÃO CERTIFICADO |
| T02 | E03 | Escolha de organização e igreja ativa | NÃO CERTIFICADO |
| T03 | E03 | Configuração guiada inicial; equipes e abertura | NÃO CERTIFICADO |
| T04 | E03 | Hoje contextual e saldos autorizados | NÃO CERTIFICADO |
| T05 | E04 | Início e retomada da contagem | NÃO CERTIFICADO |
| T06 | E04 | Contagem manual por finalidade e meio | NÃO CERTIFICADO |
| T07 | E04 | Notas, moedas e subtotais | NÃO CERTIFICADO |
| T08 | E04 | Foto de papel comum | NÃO CERTIFICADO |
| T09 | E04 | Revisão da leitura e total de controle | NÃO CERTIFICADO |
| T10 | E04 | Folha opcional imprimível | NÃO CERTIFICADO |
| T11 | E04 | Conferência independente N etapas | NÃO CERTIFICADO |
| T12 | E04 | Contagem acompanhada em um aparelho | NÃO CERTIFICADO |
| T13 | E04 | Divergência, comparação e correção | NÃO CERTIFICADO |
| T14 | E04 | Resumo / envio à tesouraria sem posting | NÃO CERTIFICADO |
| T15 | E04 | Treinamento isolado da produção | NÃO CERTIFICADO |
| T16 | E05 | Captura universal por foto, texto, arquivo, voz | NÃO CERTIFICADO |
| T17 | E05 | Entrada por finalidade e meio | NÃO CERTIFICADO |
| T18 | E05 | Despesa efetivamente paga | NÃO CERTIFICADO |
| T19 | E05 | Obrigações, pagamentos parciais e recorrência | NÃO CERTIFICADO |
| T20 | E02/E05 | Contas, saldo comprovado, transferência | NÃO CERTIFICADO |
| T21 | E05 | Movimentações e pesquisa | NÃO CERTIFICADO |
| T22 | E05 | Detalhe, edição/reversão e histórico | NÃO CERTIFICADO |
| T23 | E05 | Fila de revisão/aprovação | NÃO CERTIFICADO |
| T24 | E05 | Documentos e evidências | NÃO CERTIFICADO |
| T25 | E06 | Conciliação e importação de extrato | NÃO CERTIFICADO |
| T26 | E06 | Repasse parametrizado e versionado | NÃO CERTIFICADO |
| T27 | E06 | Revisão e fechamento do mês | NÃO CERTIFICADO |
| T28 | E06 | Prestação de contas e relatórios | NÃO CERTIFICADO |
| T29 | E07 | Espaço profissional do contador | NÃO CERTIFICADO |
| T30 | E07 | Pacote mensal e índice de evidências | NÃO CERTIFICADO |
| T31 | E07 | Histórico, auditabilidade e exportação | NÃO CERTIFICADO |
| T32 | E01/E07 | Equipe, capacidades, instituições e vigência | NÃO CERTIFICADO |

## Entregas contratuais

| Entrega | Contrato de saída | Certificação |
| --- | --- | --- |
| E01 | Finalidade x meio, política de contagem, abertura, obrigação/pagamento e migração | NÃO CERTIFICADO |
| E02 | Efetivação atômica, idempotência, partidas, reversão e saldo conciliado | **BLOQUEADA**: posting real permanece desabilitado |
| E03 | Configuração guiada, Hoje e foundation claro/escuro | NÃO CERTIFICADO |
| E04 | Contagem completa, papel comum, conferências, modo acompanhado e propostas | NÃO CERTIFICADO |
| E05 | Captura/entrada/despesa/obrigação/documentos/revisão | NÃO CERTIFICADO |
| E06 | Banco, repasse, fechamento versionado e relatório | NÃO CERTIFICADO |
| E07 | Diário, razão, balancete, pacote do contador e auditoria | NÃO CERTIFICADO |
| E08 | QA funcional + segurança + visual + dispositivos + produção | NÃO CERTIFICADO |

## Lote de segurança 01 — responsabilidade de contagem explícita

- **Alteração funcional proposta:** `finance.count.execute` ou `finance.count.view` recebida na membership canônica sinaliza responsabilidade de contagem. `finance.view` e `finance.create_drafts` permanecem como permissões técnicas compartilhadas da API legada; o gateway **nega** operações da tesouraria para Count-only.
- **Não usar título eclesiástico como autorização.** Um membro com cargo `tesoureiro` e responsabilidade explícita só de Count não ganha saldo, contas, relatórios ou movimentações. Um administrador de equipe pode ser explicitamente restrito. Financeiro com `finance.review` conserva seu próprio fluxo.
- **Compatibilidade:** memberships sem os novos marcadores conservam o bridge conservador anterior. Para que o controle seja efetivo em clientes reais, o Hub precisa emitir as capacidades canônicas por igreja/entidade, e os perfis legados precisam ser inventariados/migrados com validação.
- **Não incluído neste lote:** onboarding, equipe de 20 persistida, terceira conferência, posting/saldo, novas Rules, UI ou deploy. Não promover como uma entrega E01–E08 completa.
- **Revisar antes de produção:** fluxos Finance diretamente expostos que não usem `resolveFinanceRequestContext`; wrappers legados, integração de permissões e revogação no Hub, e exportações.
- **Testes definidos:** `npm run test:count-team-server-boundary` e `npm run test:finance-role-policy` (mais certificações existentes); resultados precisam ser coletados na CI do PR, não presumidos.

## Matriz de testes de aceitação pendente

- Contagem: C01–C08; financeiro: F01–F09; persistência: P01–P05; acessibilidade/usabilidade: A01–A06; segurança: Q01–Q05.
- Extensões exigidas: 1/2/5/20 participantes; simultaneidade; três ou mais conferências; modo acompanhado; revogação; acesso multi-igrejas; saldo indisponível x zero; scraping de APIs/IA/exportações; contador externo; testes reais iPhone/Android/desktop.
- Publicação apenas com PR validado, SHA exato, teste de regressão, plano de rollback e regras compartilhadas preservadas.
