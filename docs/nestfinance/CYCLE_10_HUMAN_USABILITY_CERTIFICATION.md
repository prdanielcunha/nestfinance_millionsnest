# NestFinance — Certificação Humana de Usabilidade do Ciclo 10

## Estado deste protocolo

Este documento prepara a certificação humana final. **Código, CI, emuladores e testes automatizados não substituem este piloto.**

O NestFinance só pode marcar o piloto como concluído quando existirem evidências reais de **3 rodadas** com cada um dos quatro perfis abaixo:

1. Pessoa idosa, primeira utilização, sem treinamento prévio.
2. Pessoa jovem leiga em finanças.
3. Tesoureiro(a) responsável pela rotina operacional.
4. Contador(a) que receberá o pacote mensal.

Total mínimo: **12 sessões humanas documentadas**.

A certificação de postagem contábil é separada e não faz parte deste protocolo.

## Ambiente

Usar uma organização de homologação com dados sintéticos. Não usar produção para experimentos. Registrar dispositivo, navegador, idioma, tamanho de tela, data e identificador anônimo da sessão.

## Rodada 1 — descoberta dos problemas

### Pessoa idosa

Sem instrução externa, pedir para:

- entrar na entidade correta;
- iniciar uma contagem;
- escolher a forma de entrada;
- registrar uma contagem simples;
- entender que uma segunda pessoa fará a conferência cega;
- identificar o resultado quando houver divergência.

Critério principal: iniciar e completar o fluxo entendendo o que fazer em cada tela, sem treinamento prévio.

### Pessoa jovem leiga

Pedir para:

- fotografar ou compartilhar um comprovante;
- usar texto ou voz para registrar uma movimentação;
- revisar a frase “Entendi assim”;
- corrigir uma interpretação;
- deixar o item pronto para revisão.

Critério principal: conseguir registrar uma evidência ou movimentação em menos de um minuto em um caso simples, sem confundir proposta com lançamento definitivo.

### Tesoureiro(a)

Pedir para:

- abrir “Hoje” e identificar as três ações prioritárias;
- conferir entradas, saídas, vencimentos e saldo quando disponível;
- usar busca natural;
- conferir um item com o banco;
- justificar uma exceção;
- executar a revisão do fechamento mensal.

Critério principal: identificar bloqueios e completar a rotina sem atalhos que removam auditoria ou confirmação humana.

### Contador(a)

Pedir para:

- abrir Relatórios;
- selecionar um mês;
- gerar os três perfis do pacote mensal;
- abrir transactions.csv, evidence-index.csv e pending-justifications-reconciliation.csv;
- localizar competência, categoria, fundo, centro de custo, contraparte, justificativas e estado de conciliação;
- dizer se o pacote é suficiente para iniciar sua conferência e quais campos ainda faltam.

Critério principal: pacote legível, rastreável e claramente apresentado como exportação operacional, não como escrituração oficial.

## Rodadas 2 e 3 — correção e nova validação

Depois da Rodada 1, corrigir os problemas observados e repetir os mesmos cenários com participantes adequados. Repetir novamente após a Rodada 2.

Uma rodada não pode ser considerada aprovada se um problema bloqueador conhecido foi apenas documentado e não corrigido.

## Casos obrigatórios transversais

Validar nas sessões ou em demonstração assistida:

- segunda contagem realmente cega;
- divergência compreensível por categoria/método/denominação;
- captura de manuscrito;
- captura por foto;
- voz curta;
- colar/compartilhar screenshot;
- fechar e reabrir offline sem perder captura;
- tentativa de aprovar ou conciliar offline permanece bloqueada;
- edição simultânea mostra o outro editor e impede sobrescrita;
- duplicidade é detectada;
- cota de IA esgotada cai para revisão humana sem efeito financeiro automático;
- histórico carrega em páginas;
- “Desde sua última visita” mostra mudanças canônicas;
- pacote do contador contém índice de evidências e pendências;
- nenhuma sugestão de IA posta, aprova, concilia ou fecha automaticamente.

## Registro mínimo de evidência

Cada sessão precisa registrar:

- persona;
- rodada (1, 2 ou 3);
- data;
- resultado: `pass` ou `needs_correction`;
- referência de evidência (ata, issue, vídeo interno, formulário ou outro artefato autorizado);
- observações objetivas e correções abertas.

Não registrar dados pessoais desnecessários dos participantes.

## Critério de conclusão

O verificador em `shared/finance/usabilityCertification.ts` exige as 12 combinações persona × rodada com referência de evidência e sem resultado `needs_correction`.

Mesmo após esse resultado, **certificação de postagem continua separada**.
