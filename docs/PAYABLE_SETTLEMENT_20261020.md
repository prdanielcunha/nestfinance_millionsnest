# Contas a pagar: implementação e continuação

## Estado desta etapa

A fundação da escrituração foi integrada à `main` pela PR341, merge `87ee9221d5d5b93e80e089e366ff7f634fe2d6a8`, após os oito checks do head `e5c83939477794392cf7c0db2218547e408624d5`. Não repetir essa auditoria nem seus testes manualmente sem uma alteração ou falha nova que justifique.

O trabalho seguinte está na branch `chatgpt/payable-settlement-20261020`. Implementa o fluxo de contas a pagar; não declara concluídos repasse, fechamento, relatórios completos na interface ou validação visual autenticada.

## Código novo

- `shared/finance/payableSettlement.ts`: reconhecimento da cobrança conferida; pagamento parcial ou total; juros/taxas; desconto; estorno exato do pagamento. O reconhecimento não reduz o banco, e o pagamento não contabiliza a despesa original novamente.
- `payableSettlementStore.ts`: obrigação, recibo, diário, saldo, movimentos do fundo, projeção diária, auditoria e revisão do livro mudam na mesma transação. Concorrência usa versão, recibo determinístico e idempotência.
- `payablesAccounting.ts` / operação `payables-accounting`: opções, histórico paginado, reconhecimento, pagamento e estorno. A autorização vem do resolver canônico; registrar exige aprovação financeira, estornar exige administração financeira. Não chama banco nem efetua transferência.
- `ledgerSetupModel.ts`, `ledgerSetup.ts` / operação `ledger-setup`: proposta determinística a partir do catálogo real, confirmação humana por hash, configuração explícita e histórico imutável, abertura a partir de declaração versionada. Preparação exige administrar e ver saldo. Não aceita um plano contábil arbitrário enviado pelo navegador.
- `LedgerPreparation.tsx`, `PayablePaymentPanel.tsx`: preparação, abertura, classificação, confirmação do pagamento e correção por interface, com PT/EN/ES, tema existente, formulários adaptáveis e histórico. Não mostra saldo a quem só pode consultar cobranças/pagamentos.
- Hoje: saldo certificado inclui pagamentos de obrigações e estornos. Saídas incluem a projeção diária de pagamentos; correções são explicitadas e não viram receita de dízimo/oferta. A consulta do saldo continua exigindo `finance.balance.view` antes de qualquer leitura do saldo certificado.

## Pontos de integridade já tratados

- `paidCents` conserva a invariância `paidCents + remainingCents = amountCents` e representa principal baixado, inclusive desconto. `principalPaidCents`, `discountCents`, `feesPaidCents` e recibos separam pagamento real, desconto e juros. A interface usa as parcelas explícitas.
- A política `reviewPolicy.requireDistinctApprover` impede que o criador confirme o reconhecimento ou o pagamento da própria cobrança. Não é ignorada por título de owner ou CEO.
- Estorno usa diário original, recibo original e início/fuso preservados no reconhecimento. Arquivar categoria, conta ou mudar a política atual não remapeia nem impede a correção histórica.
- O limite individual de principal/juros não impede estornar a soma válida desses valores.
- Uma falha de atualização da tela após resposta positiva não transforma pagamento confirmado em “pagamento falhou”. A tela impede uma nova submissão com a versão anterior.
- Fundos são projeções de movimentos identificadas como tal; não inventam saldo inicial de fundo.
- Configuração inicial bloqueia transações antigas já postadas/estornadas até migração explícita. O mês inicial confirmado é preservado; aberturas devem corresponder ao primeiro dia do mês escolhido.

## Verificação desta etapa

`scripts/test-payable-settlement.ts`: **37 casos novos passaram** após corrigir os três achados da revisão independente. Não repetir a suíte só para relatar status.

`scripts/test-payable-settlement-emulator.ts` e `scripts/test-payable-settlement-rules.ts`: testes novos, preparados para o workflow `NestFinance Payable Settlement Quality`. Registrar o resultado real antes de merge/ativação. Exercitam os handlers HTTP, preparação/abertura, pagamentos, corrida de versões, estorno após arquivar catálogo, separação entre criador e aprovador, saldo/Hoje, permissão de saldo, Count-only, isolamento, rollback e barreira do período; negam acesso direto às novas coleções privadas.

Nenhuma autenticação real do navegador, dado financeiro real, permissão real ou configuração de organização real foi alterada por esta etapa de QA.

## Pendências que continuam exigindo execução

1. Concluir CI e revisão independente deste módulo; corrigir somente falhas concretas novas.
2. Validar visualmente o fluxo autenticado quando houver sessão disponível, sem repetir o loop de login. A aba antiga não está mais disponível. Testes de handlers com identidade sintética não equivalem a teste visual com login.
3. Recorrência de contas a pagar, correção de abertura já certificada, migrações de histórico legado e anexos vinculados pelo seletor Universal Evidence precisam de slices próprios; não anunciar essas capacidades como concluídas. O pagamento atual exige referência e comprovante válido ou justificativa explícita sem documento.
4. Expor o posting/estorno da transação ordinária pela API/interface com as mesmas barreiras certificadas; aprovação continua separada de contabilização.
5. Persistir regras de repasse com vigência e obrigação; reutilizar o motor de pagamento, sem iniciar transferência bancária.
6. Fechamento/reabertura formal: snapshots imutáveis e revisão/barreira compartilhada em todos os escritores relevantes, não apenas nos novos lançamentos do livro.
7. Diário/Razão/Balancete na interface e exportações completas, cobertura e drilldown. Não alegar assinatura ou homologação profissional/fiscal.
8. Depois dos gates dos módulos completos, integrar por PR e promover `main`/`production` com o release canônico. Finance não publica as Rules compartilhadas; preservar o guard exato certificado pelo Hub.

O usuário pediu expressamente para parar de repetir auditorias aprovadas e atuar nessas pendências. Consultar resultados existentes por SHA e avançar no item seguinte, sem ciclos de polling ou login.
