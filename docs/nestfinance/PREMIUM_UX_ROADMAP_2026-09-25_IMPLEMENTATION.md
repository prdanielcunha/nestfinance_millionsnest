# NestFinance — Implementação do Roadmap UX Premium 2026-09-25

Data de implementação: 25/09/2026  
Branch: `feat/premium-roadmap-20260925`  
PR: #208  
Base: `main` em `939cca5`

## Regra de execução

Este pacote implementa o roadmap de auditoria de 25/09/2026 sobre o código atual. Ele não ativa posting real, não cria autorização client-side paralela, não altera o contrato de tenant/financeEntity e não substitui os gates financeiros existentes.

A certificação com pessoas reais, VoiceOver/TalkBack e inspeção física em dispositivos continua sendo um gate humano separado. O código e a CI podem preparar e proteger a experiência, mas não podem declarar que uma pessoa real concluiu uma tarefa sem essa sessão ter acontecido.

## P0 — concluído em engenharia

### Contagem como ação principal

- `Iniciar contagem` entrou no FAB e na command palette para quem possui `finance.view` + `finance.create_drafts`.
- A ação navega para a jornada existente; abrir o menu nunca cria uma sessão.
- Quando existe sessão ativa em `counting_a`, `counting_b`, `divergent` ou `recounting`, a ação vira `Continuar contagem` e abre a sessão correta.
- O mesmo comportamento foi aplicado ao CTA principal e aos atalhos de Hoje.
- PT/EN/ES foram adicionados às novas ações e descrições.
- Se a consulta das sessões falhar, o início de uma nova contagem fica bloqueado até o estado ser conhecido, evitando duplicidade por incerteza.

### Entidade e intenção

- `FinanceContextGuard` já preservava `returnTo`; o Shell agora consome essa intenção depois que a entidade é definida.
- Assim, quem toca em Contagem sem entidade ativa escolhe a igreja e volta para a tarefa originalmente solicitada.
- O retorno é aceito somente para caminhos internos `/finance/...`.

### FAB / mobile

- O FAB passou de lista flutuante sobre o conteúdo para folha contextual acima da navegação.
- Até quatro ações aparecem como principais; o restante permanece acessível em `Ver todas as ações`.
- Voluntário/tesoureiro recebem Contagem primeiro; outros perfis mantêm ações de movimentação prioritárias.
- Cada ação possui consequência explicada.
- Captura de comprovante é visual e textualmente separada de nova entrada.
- Escape fecha a folha e devolve foco ao botão; ao abrir, o foco entra na primeira ação.

### Cabeçalho mobile

- O logo horizontal e controles comprimidos foram substituídos pelo símbolo + contexto ativo.
- Organização/entidade completas, idioma, perfil, troca de organização, retorno ao Hub e saída ficam em uma folha contextual.
- O nome completo não depende mais do truncamento do cabeçalho para ser descoberto.

### Hoje e visão global

- O panorama do ecossistema ordena organizações com atenção antes das demais.
- Cinco cards equivalentes de métricas foram condensados em um resumo silencioso.
- Quando não há atenção, a interface comunica o estado em uma frase em vez de apresentar vários zeros com o mesmo peso.
- O snapshot usa `generatedAt` do servidor e exibe horário de atualização.
- Falha de refresh não apaga o último snapshot carregado.
- Hoje detecta contagem ativa e oferece continuar.
- Métricas operacionais e de pipeline foram consolidadas em superfícies únicas com separadores.

## P1 — concluído em engenharia, com certificação humana pendente

### Foundation e hierarquia

A base de `Surface`, `Button`, `FinanceSelect`, feedback de fluxo, tokens, foco, reduced motion e números tabulares já existia na `main`. Esta implementação a reaproveita em vez de introduzir um segundo design system.

Mudanças deste pacote:

- Hoje: menos cards equivalentes e maior separação entre decisão, dados e detalhes.
- Ecossistema: atenção antes de estatística.
- Relatórios: remoção do tratamento repetitivo de cards neutros aninhados.
- Mais: áreas agrupadas em lista explicativa.
- Ajustes: hub convertido para lista agrupada, com PT/EN/ES.
- Movimentações e Revisão: status sub-12px removidos.

### Explicação no momento da escolha

A criação e a edição guiada de movimentações já usam `FinanceSelect` e `transactionOptionGuidance` para Conta, Fundo, Categoria e Forma. A jornada de Contagem já descreve cada método antes da escolha. Este pacote mantém essa arquitetura e adiciona explicação às novas ações globais.

### Linguagem humana de status

O código atual de Count e Today já traduz estados técnicos em frases de tarefa, como segunda conferência, diferença e revisão. A implementação mantém os estados internos para engenharia e apresenta linguagem humana no primeiro nível.

### Medição de jornadas

Foram adicionados eventos agregados de `flow_start` / `flow_complete` para:

- iniciar contagem por método;
- retomar contagem;
- salvar nova movimentação como rascunho;
- criar e enviar nova movimentação para revisão.

A telemetria existente continua best-effort e não bloqueia fluxo financeiro.

## P2 — engenharia aplicada; gates físicos permanecem pendentes

### Profundidade profissional

- Movimentações preservam inspector, busca, filtros e densidade profissional.
- Revisão mantém fila e contexto de conferência.
- Relatórios mantêm profundidade, com menor ruído de superfícies neutras.
- Auditoria e Conferir preservam seus workspaces responsivos já existentes.
- Mais e Ajustes foram refinados para descoberta por tarefa, sem remover áreas profissionais.

### Desktop

Nenhum recurso profissional foi removido para simplificar o mobile. Os workspaces existentes com grids, inspector e painéis responsivos foram preservados; os ajustes deste pacote atacam hierarquia e densidade sem “esticar mobile”.

### Acessibilidade de engenharia

- remoção de labels operacionais em 10/11 px nas áreas tocadas;
- folha do FAB com semântica de diálogo;
- entrada e retorno de foco;
- Escape;
- alvos de toque já providos pela Foundation;
- reduced motion e focus-visible preservados;
- PT/EN/ES nas novas superfícies;
- gate automatizado específico do roadmap.

### Freshness

- Today já escuta mudanças financeiras, foco, online e atualização periódica.
- Ecossistema agora atualiza por eventos financeiros/foco/online e mostra o horário real do snapshot.
- Em falha, o último snapshot confiável permanece visível em vez de fingir dado em tempo real.

## Gate novo

`npm run test:premium-roadmap-20260925`

O gate verifica, entre outros pontos:

- Contagem no FAB/paleta/Hoje;
- permissão `view + create`;
- máximo de quatro ações principais;
- nenhuma criação de Count no Shell;
- retorno à intenção após escolha de entidade;
- resume de Count;
- hierarquia/freshness do ecossistema;
- PT/EN/ES das ações;
- ausência de texto operacional em 10/11 px nas áreas tocadas;
- FinanceSelect nas jornadas de movimentação;
- telemetria dos fluxos;
- editor guiado como rota principal;
- redução do padrão antigo de cards em Relatórios.

O workflow `NestFinance Frontend Quality Gate` executa este teste junto de lint, build e ciclos 01–10.

## O que ainda exige prova humana antes de chamar de “certificado 10/10”

Estes itens não podem ser marcados honestamente por alteração de código:

- cinco pessoas sem treinamento concluírem tarefas essenciais;
- mediana real de tempo e cliques cair contra uma linha de base observada;
- voluntário encontrar Contagem em uma abertura do “+” em teste moderado;
- gestor identificar organização com pendência em até cinco segundos;
- VoiceOver e TalkBack em dispositivos reais;
- zoom 200% e teclado em matriz física/navegadores reais;
- inspeção visual em 320, 390, 768 e 1440 px com dados representativos;
- perfis voluntário, tesoureiro, gestor, CEO e consulta em sessão autenticada real.

Esses pontos permanecem como **certificação humana**, não como backlog de implementação.

## Não alterado de propósito

- posting real continua bloqueado conforme gates existentes;
- autorização continua server-side;
- Hub continua fonte canônica de identidade e autorização global;
- isolamento por organização e financeEntity foi preservado;
- nenhuma nova plataforma, OCR pago ou provedor de IA foi adicionado;
- nenhum refactor amplo foi feito apenas por estética.
