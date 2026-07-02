# Diretrizes para Agentes de IA

Este repositório pertence ao aplicativo **NestFinance**, parte do ecossistema MillionsNest. 

O Google AI Studio é o único agente autorizado a modificar o código e sincronizar alterações na branch `main`.

A branch `main` representa desenvolvimento e homologação.
A branch `production` representa o código aprovado e publicado.

ChatGPT e Codex atuarão como auditores e revisores em modo somente leitura.

## Regras Obrigatórias

1. **Ler Contexto:** Ler o código e os documentos técnicos (`/docs/ARCHITECTURE_CURRENT.md`, `/docs/AI_CHANGE_PROTOCOL.md`) antes de alterar qualquer arquivo.
2. **Entender o Comportamento Atual:** Entender o comportamento atual antes de propor qualquer mudança.
3. **Escopo Estrito:** Fazer somente alterações dentro do escopo solicitado.
4. **Sem Refatorações Oportunistas:** Não realizar refatorações oportunistas.
5. **Preservar Existente:** Não alterar textos, layout, rotas, contratos, permissões, banco ou arquitetura fora do escopo. Preservar funcionalidades já existentes.
6. **Multi-tenant & Isolamento:** Preservar multi-tenant e isolamento por organização (`organizationId`).
7. **Não Confiar Cega no Frontend:** Nunca aceitar cegamente `organizationId`, `userId`, `role`, permissões ou contexto enviados pelo frontend.
8. **Verificação no Backend:** Autorizações críticas devem ser verificadas no backend.
9. **Firestore Rules:** Firestore Rules devem permanecer compatíveis e seguras quando aplicável.
10. **Zero Bypasses:** Nunca criar bypass por e-mail, UID, nome ou valor hardcoded.
11. **Fontes Únicas de Verdade:** Não criar fontes paralelas de identidade, organizações, memberships, RBAC, billing, assinatura ou entitlements.
12. **Ecossistema:** Respeitar a MillionsNest como plataforma central do ecossistema quando essa integração existir no código.
13. **Papéis:** Diferenciar owner, membro, papel organizacional, papel global e função operacional ou musical (conforme RBAC existente no `ecosystemSessionResolver`).
14. **Internacionalização (i18n):** Preservar a arquitetura de internacionalização. Todo novo texto visível deve suportar Português, English e Español.
15. **Design:** Aplicar Mobile First e Desktop Excellent. Preservar o design system existente (Tailwind V4).
16. **Infraestrutura:** Não alterar coleções, documentos, índices, regras, contratos de API ou variáveis de ambiente sem necessidade comprovada.
17. **Segurança de Segredos:** Não expor segredos, tokens ou credenciais.
18. **Comandos Autorizados:** Utilizar somente comandos que realmente existam no repositório.
19. **Validação:** Executar, quando disponíveis: `lint`, `typecheck`, `build` e `testes` relacionados.
20. **Revisão Final:** Revisar o diff completo antes de concluir.
21. **Relatório Claro:** Informar claramente: arquivos criados/modificados, comportamento anterior/novo, comandos executados/resultados, riscos, configurações manuais e confirmar ausência de mudanças fora de escopo.
22. **Honestidade nos Testes:** Nunca afirmar que um teste passou sem evidência da execução.
