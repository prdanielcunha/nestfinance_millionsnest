# Conclusão financeira: implementação e homologação

## O que mudou

O detalhe da movimentação oferece efetivação explícita após aprovação e estorno
em período aberto, com confirmação, motivo e idempotência. Aprovar não efetiva
automaticamente. As ações registram o financeiro e não enviam dinheiro ao banco.

Em Contas a pagar, Repasses permite cadastrar uma regra versionada por vigência,
destinatário, percentual e categorias de entrada escolhidas explicitamente. A
base usa recebimentos efetivados e estornos datados. Transferências internas não
entram no cálculo. A prévia precisa corresponder ao material confirmado no
servidor. Uma nova apuração prepara uma obrigação para revisão; substituir uma
apuração cancela a anterior somente enquanto ela não estiver reconhecida/paga.
Crédito por base negativa e obrigação já reconhecida exigem revisão explícita.
Não existe percentual presumido nem transferência automática.

Em Relatórios, o fechamento mensal verifica contagens, documentos, movimentações,
conciliação bancária, obrigações e repasses antes de confirmar o mês. A sequência
começa no primeiro mês preparado. Fechar cria um snapshot imutável de Diário,
Razão, Balancete e índices de fontes, dividido em partes verificadas por hash.
CSV e JSON do fechamento preservam os valores da versão fechada. Pagamentos ou
estornos posteriores não reescrevem esse snapshot.

A reabertura exige motivo, versão atual e o último mês fechado. Refechar cria
outra versão; as versões anteriores continuam consultáveis. A auditoria guarda
autoria, data, motivo e transição de versão. Assinatura profissional e emissão
fiscal continuam sob responsabilidade do profissional habilitado.

## Barreira transacional

O acesso compartilhado ao Firestore envolve `runTransaction`: todos os writes
financeiros são preparados, as fontes originais e a barreira são lidas antes de
qualquer write físico, e uma revisão de fontes serializa escritores e fechamento.
São protegidas movimentações, alocações, diários, conciliações, contagens V1/V3,
documentos, artefatos relacionados, aberturas e contas a pagar. A barreira não
concede acesso: Auth, organização, entidade e capabilities continuam canônicos.

O HTTP responde 409 para tentativa de alterar mês fechado. Mover uma fonte antiga
para data nova não contorna o bloqueio. Uma baixa certificada em mês aberto pode
atualizar somente o ciclo de pagamento de uma obrigação antiga, no mesmo commit
do diário e do recibo. Capturas herdam a data da contagem correspondente.

## Evidências e limites

- Gate dedicado: `nestfinance-completion-quality.yml`, Node 22, Java 21 e
  Firebase Tools 15.27.0; somente projeto `demo-*` no emulador local.
- `test-finance-completion-emulator.ts`: HTTP real dos handlers, isolamento,
  permissões, aprovação/efetivação, retries, apuração/substituição/obrigação,
  pagamentos, fechamento contra escritor concorrente, reabertura/reversão,
  snapshots históricos, corrupção de snapshot e documentos duplicados.
- `test-remittance-policy.ts`: arredondamento inteiro, categorias explícitas,
  exclusão de transferências/aberturas, estornos, vigência e limites.
- A alteração da barreira exige regressões de persistência de livro e pagamento.
  Os testes não devem ser substituídos por verificações textuais.
- Nenhum dado financeiro real deve ser criado para homologação.
- As consultas exigem cobertura completa: até 5.000 diários e até 5.000 fontes
  por coleção, com até 200 contas. Acima disso, a operação bloqueia explicitamente;
  não entrega um total parcial como completo. Snapshot limitado a 350 partes.
- Backend/emulador não comprovam uso em aparelho físico. Registrar separadamente
  a evidência visual autenticada e qualquer validação em Android/iPhone reais.
- A correção isolada da troca de organização foi publicada pelas PRs 347/348:
  após troca canônica de token, recria a página para sincronizar todos os contextos.

Este registro descreve o comportamento implementado e os critérios de aceitação.
Não declara homologação concluída apenas pela existência do código ou pelo CI.

## Correção da homologação autenticada

A inspeção autenticada identificou dois impedimentos adicionais: o bootstrap
histórico omitia `organizationId` em catálogos, e as duas flags de cadastro e
revisão de contas a pagar estavam desligadas no runtime. A compatibilidade agora
exige snapshot obtido pelo servidor no caminho exato de organização/coleção e
`financeEntityId` correspondente. Somente a ausência do campo redundante é
aceita; organização explicitamente divergente continua bloqueada. Livros,
configurações, obrigações, transações, auditoria e snapshots continuam estritos.
Novos catálogos de bootstrap já gravam o campo. Não há backfill financeiro.

A publicação habilita explicitamente apenas `NESTFINANCE_PAYABLES_WRITE_ENABLED`
e `NESTFINANCE_PAYABLES_REVIEW_ENABLED`; a comparação exata do runtime permanece
para todas as demais variáveis, secrets, recursos, IAM e tags. A revisão anterior
permanece disponível para rollback. Não há pagamento, saldo ou percentual criado.
O menu e a busca incluem Contas a pagar conforme as capabilities existentes.

O primeiro período, os valores iniciais verificados e a regra de repasse exigem
decisão humana, não valores inventados para passar homologação. Uso em aparelho
físico segue distinto da navegação autenticada no navegador da nuvem.
