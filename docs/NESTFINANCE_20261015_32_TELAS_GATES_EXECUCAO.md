# NestFinance — contrato de execução integral das 32 telas (especificação de 15/10/2026)

**Referência de produto:** `NestFinance_Especificacao_Detalhada_Telas_Funcoes_IA_2026-10-15(2).docx`, 30 páginas, especialmente T01–T32 (p. 5–15), entregas E01–E08 (p. 23), matriz (p. 24) e seis conceitos ilustrativos (p. 28–30). Consultar também `NESTFINANCE — PRODUCT EXPERIENCE STANDARD.txt`, `AGENTS.md`, `docs/ARCHITECTURE_CURRENT.md` e `docs/NESTFINANCE_20261016_TRACEABILITY.md`.

**Status desta matriz:** rastreamento de requisitos; **não é certificado funcional nem visual**. Os wireframes originais são propostas com dados fictícios e não capturas de produção. Não usar esta matriz como autorização para publicar. T01–T32 continuam abertos para validação completa de comportamento + dados + permissão + PT/EN/ES + responsividade + acessibilidade + dispositivo real. Marcar item concluído somente com links de PR, execução CI e evidência anonimizada; `npm run build` isolado não certifica telas.

## Regras irrevogáveis

1. Os três caminhos da entrada são **Contar dízimos e ofertas**, **Cuidar do financeiro** (tesouraria) e **Espaço do contador**. Contador de culto e contador profissional **não** são a mesma função. Voluntários não escolhem contas contábeis nem criam lançamentos postados.
2. Dinheiro físico contado, Pix/cartão identificado, rascunhos/propostas, valores aprovados e saldo efetivado são estados distintos. Saldo não verificado é **desconhecido**, nunca `R$ 0,00` inventado.
3. Finalidade (dízimo/oferta/outro/não classificado) é independente de meio (dinheiro/Pix/cartão/outro). `Total` manuscrito é controle, **não receita extra**. Se só há “Pix 200”, finalidade fica pendente de revisão.
4. Dados por organização/igreja são isolados pelo Hub e revalidados no servidor; permissões finas com revogação. Modo acompanhado não é contagem independente. Aprovador/contador externo recebem acesso limitado e revogável.
5. IA lê/sugere com origem e versão; nunca paga, posta, confirma contagem, informa zero para ilegível ou altera autorização. IA indisponível deixa caminho manual. Documentos são dados não confiáveis, nunca instruções.
6. Alteração financeira exige transação, integridade, idempotência, versão e auditoria; reversão/ajuste preserva história, não exclusão arbitrária. Produção mantém flags fechadas até F01–F09/P01–P05/Q01–Q05 verdes e homologação autorizada.
7. Operação sem novos serviços pagos; uso de IA com privacidade/consentimento e custo estabelecidos. PT/EN/ES; foco e contraste WCAG AA; celular 320/390px, tablet 768px, desktop 1440px e zoom 200%.

## Matriz tela → comportamento e aceite (não certificado)

| ID | Superfície/risco de negócio | Evidência funcional necessária antes de concluir |
|---|---|---|
| **T01** | Login Google/Hub | Entrada canônica direta/Hub, trocar conta, renovar sessão e recuperar erro sem retorno arbitrário ou papel em storage como autoridade. |
| **T02** | Escolha da igreja | Contexto real de uma/várias igrejas, pesquisa, retomada da intenção, rascunho preservado na origem e revogação limpando dados anteriores. |
| **T03** | Primeiro uso | Igreja → dinheiro/bancos → equipe → conferência inicial; abertura com data/origem ou desconhecida, templates sem duplicação, preview e recuperação; nenhum saldo estimado. |
| **T04** | Hoje da tesouraria | Uma tarefa prioritária, até três pendências, saldo **confirmado ou indisponível** com composição, contas por pagar separadas, origem e frescor dos dados. |
| **T05** | Iniciar/retomar contagem | Culto hoje/outro/continuar; foto de papel ou digitação primeiro; igreja e data canônicas; criação explícita idempotente; consulta incerta não cria duplicidade. |
| **T06** | Digitar valores | Uma pergunta por vez, finalidade×meio, dinheiro antes de digital, zero explícito vs vazio, centavos exatos, autosave e revisão com correção. |
| **T07** | Notas e moedas | Quantidade inteira por denominação, subtotal determinístico, ajuste justificado; alternar manual sem perder histórico ou confundir finalidade. |
| **T08** | Foto de papel comum | Caderno, galeria/câmera só sob ação, original e múltiplas páginas, enquadrar/reordenar; selecionar arquivo nunca chama IA nem cria entrada. |
| **T09** | Revisar leitura do papel | Imagem e região junto do campo; “não consigo ler”, correções, campos adicionais, total de controle não como parcela, humano confirma versão. |
| **T10** | Folha oficial opcional | A4/Letter, duas opções (totais e denominações), culto/versão e código não autorizador; reimprimir sem criar nova contagem. |
| **T11** | Segunda conferência independente | Convite expira, código não concede acesso; segundo conta às cegas em servidor/cliente/cache; mesmo usuário bloqueado sob política; reenvio seguro. |
| **T12** | Contagem acompanhada | Contador físico e operador digital distintos; ambos identificados, nota de que **não são duas contagens independentes**; flag/política igreja; sem Google obrigatório para idoso. |
| **T13** | Resolver divergência | Deltas por finalidade/meio/denominação, mesmo total com classificação diferente continua divergente; recontagem, autoria, versões e nenhum desempate por IA. |
| **T14** | Resumo para tesouraria | Físico × digital, participantes/evidências, proposta canônica **uma vez**, origem rastreável; voluntário não vê postagem; correções nunca geram receita oculta. |
| **T15** | Treinamento | Exercícios totalmente sintéticos, indicador permanente de treino, nenhuma gravação financeira, sair sem afetar permissões; ajuda falada opcional. |
| **T16** | Captura universal | Texto/colar/foto/arquivo/voz convergem para revisão; boleto não prova pagamento; vínculo a evidência e intenção sobrevivem, ambiguidades perguntadas. |
| **T17** | Registrar entrada | Valor, origem, data, destino e propósito claros; agregado de culto preserva identidade; evidência e detecção de duplicata, proposta não altera saldo. |
| **T18** | Registrar despesa | Distinção real **já paguei** vs **ainda vou pagar**; conta/data/competência/comprovante; documento de cobrança não vira despesa paga. |
| **T19** | Contas a pagar | Vencidas/hoje/próximas, recorrência sem pagamento fictício, parcial/liquidação correta, juros/desconto e edição de série. |
| **T20** | Contas/saldos/transferência | Abertura datada e auditável, dinheiro/bancos/reservados separados, transferir é débito+crédito atômico sem nova receita, tarifa separada, histórico de arquivadas. |
| **T21** | Lista e busca | Estado de lançamento visível, filtros persistentes, busca por pessoa/valor/texto autorizada e cobertura de páginas/índice explícita. |
| **T22** | Detalhe e correção | Efeito no saldo, documento e origem; rascunho editável, lançado corrigido por reversão/ajuste, trilha antes/depois e contabilidade expansível. |
| **T23** | Fila de revisão | Prioridade por pendência verificável, documento lado a lado no desktop, próxima conferência sem voltar, aprovação com versão e sem posting implícito. |
| **T24** | Documentos | Não identificado/pronto/possível duplicata/concluído; abrir vínculo em vez de recriar; PDF múltiplo, evidência privada e estados independentes de pagamento. |
| **T25** | Conferir com banco | Conta/período, extrato suportado, correspondência por mais que valor, Pix vinculado à contagem, exceções, saldo abertura+movimentos=fim, reversões rastreáveis. |
| **T26** | Repasse à convenção | Regra versionada: base dízimo/oferta, percentual, datas, arredondamento e destinatário; parcial/estorno/diferença; obrigação e pagamento sem duplicação. |
| **T27** | Conferir/fechar mês | Saldo anterior + entradas postadas − saídas postadas ± transferências por conta, pendências, snapshot versionado; **revisado ≠ fechado** e reabrir com motivo. |
| **T28** | Relatórios | “Começamos/Recebemos/Pagamos/Terminamos”, base/período/versão, abrir composição, relatório operacional ≠ balanço oficial; IA descreve dados, não inventa causa. |
| **T29** | Espaço do contador | Responsável vê período, entidades, mapeamento, diário, razão, balancete, conciliação e pendências; qualquer total → partida → documento. |
| **T30** | Pacote do contador | Check de cobertura, contagens/contas/documentos/CSV/exceções/index com manifesto e versão; CSV anti-fórmula, sem ZIP completo falso; terceiros por ação explícita. |
| **T31** | Histórico e auditoria | Ação/autor/antes-depois vinculados, automático vs humano, filtros, paginação honesta, correlação técnica protegida e imutabilidade no backend. |
| **T32** | Equipe e configurações | Papéis por igreja, revogação real, contador externo restrito, conta/categoria/regras com vigência, perfis igreja/associação/projeto e arquivo sem apagar história. |

### As SEIS telas ilustradas (páginas 28–30) — contrato de fidelidade

| Referência | Tela de produto | Hierarquia proposta e adaptação obrigatória |
|---|---|---|
| **V01** p. 28 esquerda | **Hoje** (T04) | Igreja em cabeçalho, situação do mês, **saldo confirmado ou estado indisponível**, linha contagem pendente, linha contas por pagar, próximo passo dominante “Conferir contagem” e ação “Registrar entrada ou despesa”; navegação Hoje/Contar/Registrar/Mais. Valor `R$ 1.800` da arte é fictício, nunca inserir como demo em produção. |
| **V02** p. 28 direita | **Contar o culto** (T05–T06) | Igreja + culto/data, pergunta “Como prefere registrar?”, opção dominante **Fotografar meu papel**, depois **Digitar os valores**, demais formas recolhidas (folha/voz), ajuda e teclado/câmera sem saltos. |
| **V03** p. 29 esquerda | **Conferir o papel** (T08–T09) | Original e leitura por finalidade, subtotal e total de controle distintos, linha clicável para corrigir/abrir trecho, divergência escrita, botão “Conferi com o papel”; nunca postagem por aprovação de OCR. |
| **V04** p. 29 direita | **Registrar despesa** (T18–T19) | Valor/descrição legíveis, escolha explícita **“Sim, já paguei” / “Ainda vou pagar”**, conta/data/evidência conforme opção e botão **“Enviar para conferência”**. Sem modelo de obrigação completo, não fingir que botão cria contas a pagar. |
| **V05** p. 30 esquerda | **Conferir mês** (T27–T28) | Saldo inicial conciliado, entrou/saiu, saldo futuro, contas a pagar à parte, pendências e próximo passo; quando saldo não comprovável, mostrar `—`/explicação, **não** calcular um exemplo visual como saldo real. |
| **V06** p. 30 direita | **Espaço do contador** (T29–T30) | Período+igreja, pendências, balancete, diário/razão, conciliação, rastro total→registro→evidência e pacote; itens contábeis não certificados permanecem inacessíveis COM explicação, não botões de fachada. |

**Direção de design:** superfícies marfim `#F6F4EF`, branco `#FFFFFF`, texto `#17242C`, petróleo `#1D4653`, dourado de detalhe `#A27736`, sem cards decorativos excessivos; corpo operacional 18px, títulos 26–32px, números tabulares, CTA >=56px, paridade dark/accessibility; media em 320/390/768/1440px. Evoluir componentes `foundation` e tokens atuais sem reiniciar navegação, nem apresentar screenshot de proposta como versão publicada. A atual base de tema já existe em `src/index.css`/`ThemeContext`; essa existência **não** certifica as seis telas.

## Sequência E01–E08 e critérios de liberação

- **E01 — modelo e contratos:** propósito×meio, policy 1–20/independente/acompanhada, abertura, obrigação/pagamento, estados, compatibilidade de legado (sem inferência). Abrir os casos que não possuem dados de origem.
- **E02 — efetivação segura:** teste com transação Finance real `approved_for_posting`/versão, mapeamento contábil, journal balanceado, idempotência, saldo por conta, reversão e auditoria. **BLOQUEADA** enquanto não há prova de duplo lançamento, reconciliação e fechamento. Não ativar `transactions-post` ou flags em produção só para fechar UX.
- **E03 — configuração e Hoje:** T01–T04, fluxo de abertura e equipe, indicador de saldo com base/proveniência, paridade visual; verificar contexto quando só existe uma igreja ou quando usuário muda de organização.
- **E04 — Contagem ponta a ponta:** T05–T15; exemplos C01–C08, inclusive papel comum, segundo conferente cego e acompanhado, três conferências/20 participantes, fluxo Count→tesouraria sem dupla receita.
- **E05 — Tesouraria:** T16–T24, documento→rascunho→revisão→aprovação e obrigação/pagamento parcial, com versão e sem confundir previsão/efetivação.
- **E06 — Banco/convenção/mês:** T25–T28; importar extratos com suporte testado, repasse parametrizado/vigência, fechar/reabrir com cobertura e snapshot; relatório reconciliado.
- **E07 — Contador:** T29–T32; razão/diário/balancete e drill-down documental, pacote com cobertura real, auditoria e permissões externas.
- **E08 — Homologação:** layouts V01–V06 e T01–T32 no iPhone, Android e desktop, 200%/leitor de tela, IA offline, emuladores, regras Firestore, produção por gates e rollback. Só evidência de uso real libera estado **CERTIFICADO**.

## Casos de aceitação que não podem desaparecer

- **C01–C08:** `350 + 120 = 470` com `Total 470` como controle; `80/800` duvidoso; 2 páginas/subtotal repetido; vazio×zero; A/B com mesmo total e categorias diferentes; mesma pessoa não independente; idoso e operador assistidos sem fraude; logout/troca não revela contagem anterior.
- **F01–F09:** papel/Pix/extrato vinculados uma vez; depósito como transferência; boleto sem pagamento; liquidação parcial; transferência+tarifa; abertura datada sem duplicar histórico; resultado negativo ≠ saldo negativo; reversão rastreável; conta arquivada incluída na série histórica.
- **P01–P05:** retry com mesmo efeito; dois revisores e version conflict; mês fechado impede edição; repasse com vigência; exportação sem truncar total.
- **A01–A06:** voluntário sem formação, tesoureiro sabe se pagou, contador chega à evidência; zoom/leitor; celulares/teclado/câmera; IA indisponível → manual.
- **Q01–Q05:** cross-tenant proibido; prompt injection na foto não eleva permissão; CSV/PDF não vazam igreja; permissão negada não vira R$0; eventos confiáveis para post/reverse/close/reopen.

## Situação rastreada em 16/10/2026 (não significa homologação)

- PRs **#288, #289, #290** integradas à `main`: criação de declaração de saldo inicial, correção com histórico imutável e consulta paginada. Somente metadados pendentes, **não posting**.
- PR **#296** introduz gate E2E Firestore para abertura/correção/concorrência/proveniência. Seu estado depende de checks e merge; consultar GitHub antes de marcar integrado.
- Código de UI/tema, contagem, captura, propostas, revisão, read models, conciliação preparatória e espaço do contador já existe em parte. **Não presumir** que jornada esteja pronta porque um componente foi localizado.
- PRs históricas **#270** (tema) e **#275** (policy) estão abertas e com branches divergentes; grande parte dos arquivos já existe na `main`. Resolver por comparação/PR de escopo mínimo, **nunca** merge por força ou sobrescrita de versão atual.
- `production` divergia de `main`. Nenhum push/merge de `main` para `production` sem ancestralidade reconciliada, gates específicos, rollout reversível e validação de Firebase Hosting/Cloud Run/Rules compartilhadas.
- A visão de produto ainda exige T18/T19 contas a pagar, T26 repasse parametrizado, T27 fechamento definitivo e T29 escrituração reconhecida. Não fabricar dados, demonstrativos ou prometer certificação legal/fiscal.

**Registro de conclusão por tela:** substituir NÃO CERTIFICADO na matriz canônica apenas com `PR + SHA + teste CI E2E + telas 320/390/768/1440 + auditoria de permissão + aceite humano + confirmação produção`. Falhas de infraestrutura têm status próprio e não viram aprovações fictícias.
