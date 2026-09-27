# Exclusão definitiva de movimentações sem efeito contábil

## Escopo certificado

Na tela de Movimentações, owner/admin com acesso canônico `finance.manage` (ou acesso global) pode selecionar até dez itens carregados e confirmar digitando a palavra exibida. A operação é atômica: se um item falhar, nenhum é excluído.

O servidor revalida organização, entidade, papel, capability, versão, estado e vínculos. Só admite `draft`, `ready_for_review` e `approved_for_posting` com origem `manual`, sem comprovante, sem fonte de Contagem, sem conciliação e sem indícios de posting/journal. A transação, suas classificações, aprovações subordinadas e índice de busca são excluídos. Auditoria, fatos canônicos e eventos de exclusão permanecem; o aplicativo avisa isso antes de confirmar.

Itens lançados, estornados, conciliados, com comprovantes, oriundos de contagem/documentos/importações, com vínculos desconhecidos ou em versão diferente falham fechados. Essa ação não apaga comprovantes, fatos históricos, trilhas de auditoria, contas, saldos ou registros de outra entidade. Não existe seleção implícita de todo o histórico; o usuário marca somente itens carregados.

## Gates

- `test:transaction-permanent-removal`: política de estados e barreiras de servidor.
- `test-transaction-permanent-removal-emulator.ts`: exclusão atômica, subcoleção de aprovações, auditoria, proteção de posted e isolamento da entidade em Firestore Emulator Java 21.
- Lint, contrato de API, isolamento SaaS e build.

O gate de emulador precisa passar no CI antes da promoção. A exclusão dos dados existentes é uma ação posterior e explícita no app, jamais efeito do deploy.
