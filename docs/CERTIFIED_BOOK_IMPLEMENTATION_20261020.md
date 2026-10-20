# Motor de escrituração — implementação em andamento

Este documento registra código implementado, não uma homologação dos módulos solicitados.

## Escopo implementado nesta etapa

- Aprovação nova v3 inclui material de reembolso, origem de conta a pagar e tipo de liquidação. Hash do plano usa a mesma versão antes/depois da aprovação.
- Configuração explícita do plano de contas, referências reais ativas e isolamento por organização/entidade. A prévia histórica permanece disponível; sua configuração sintetizada nunca autoriza este motor.
- Certificação de abertura a partir da declaração pendente versionada. Valor não informado não vira zero. Abertura não nula produz diário balanceado; zero produz recibo imutável explícito.
- Persistência transacional de diário, atualização da transação, saldos verificados, movimentos de fundos, revisão compartilhada, auditoria e fato de contabilização.
- Estorno em data própria, invertendo o diário original imutável. Não recalcula o passado com o plano atual. Não permite estornar fonte já estornada ou conciliada.
- Diário, Razão e Balancete derivados do histórico imutável; leitura exige cobertura exata, aberturas verificadas e igualdade entre projeções e diário. Limite de 5.000 entradas bloqueia a consulta, sem retornar total parcial como completo.

## Limites deliberados

O motor ainda não está exposto por gateway nem habilitado em produção. Os testes novos de domínio não equivalem a autorização ou navegação autenticada. Nenhum dado financeiro real foi criado ou alterado.

Reembolso/contas a pagar vinculados e centros de custo são bloqueados explicitamente até existir o efeito atômico correspondente. Movimentos de fundos são identificados como movimentos; não afirmam conhecer o saldo inicial de um fundo. Não existe alegação de certificação profissional/fiscal.

O bloqueio de período no motor está implementado, mas **não existe fechamento formal homologado**. Antes de expô-lo, todos os escritores que influenciam o snapshot (transações, contagens, documentos, conciliação, configuração) precisam compartilhar a barreira/revisão e validar datas fechadas. Não basta gravar `closedThrough` numa tela.

## Verificação reproduzível

```bash
node --import tsx scripts/test-certified-book.ts
node --import tsx scripts/test-posting-plan.ts
node --import tsx scripts/test-journal-integrity-e02.ts
npm run lint
npm run build
```

O workflow `NestFinance Certified Book Quality` usa Java 21, Node 22 e Firebase Tools 15.27.0 para o teste real de persistência:

```bash
NODE_ENV=test FIREBASE_PROJECT_ID=demo-certified-book GCLOUD_PROJECT=demo-certified-book \
  npx firebase-tools emulators:exec --only firestore --project demo-certified-book \
  "node --import tsx scripts/test-certified-book-emulator.ts"
```

O script recusa execução sem `FIRESTORE_EMULATOR_HOST` e sem projeto `demo-*`. Verifica abertura, retry, duplicação concorrente, estorno, fundos, rollback antes de commit, aprovação alterada, referência inativa, isolamento, barreira do período e cobertura incompleta. Registrar resultados reais do workflow antes de integrar/ativar qualquer endpoint.

## Continuação necessária para cumprir a solicitação integral

1. Finalizar revisão independente e corrigir achados; executar testes de persistência e concorrência, inclusive dois escritores independentes e reversão concorrente.
2. Adicionar gateway com validação estrita, contexto ativo canônico, permissão explícita apropriada e idempotência. Relatórios exigem `finance.balance.view`, inclusive contra acesso direto à API. Aprovar não deve contabilizar automaticamente.
3. Expor configuração/abertura em linguagem simples, PT/EN/ES, com aprovação humana e histórico; sem ativar configuração de organização real durante QA.
4. Implementar reconhecimento/baixa parcial de obrigações, juros/descontos e reversão da baixa no mesmo commit do diário. Recorrências não pagam automaticamente.
5. Persistir regras de repasse versionadas por vigência e confirmar obrigação por preview/hash; pagamento usa o mesmo motor de obrigações e não inicia transferência bancária.
6. Fechamento/reabertura com todos os escritores protegidos, cobertura operacional e contábil, snapshot imutável e ordem cronológica.
7. Interface e exportações completas de Diário/Razão/Balancete com drilldown; distinguir relatório do app de assinatura/homologação profissional.
8. Validação visual autenticada em tamanhos móvel/tablet/desktop, temas claro/escuro e permissões. A tentativa segura anterior de autenticação expirou; não repetir o loop. Não alegar testes físicos em iPhone/iPad/Android sem evidência.
9. PRs com gates e revisão independente; depois sincronizar `main`/`production` e verificar release servido. Preservar o guard estrito do hash de Rules certificado pelo Hub; Finance não publica Rules compartilhadas.
