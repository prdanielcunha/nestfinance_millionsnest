# Autonomous Engineering Policy

## Papéis
- OpenClaw: operador/orquestrador.
- Codex ou agente de código: executor de implementação.
- OpenAI Reviewer: autoridade final de engenharia independente de quem executou.
- Usuário: direção de produto e direito de pedir rollback/desfazer; não é gate rotineiro de aprovação técnica.

## Fluxo obrigatório
1. Revalidar repo/branch/SHA, código, testes e documentação.
2. Implementar somente a menor mudança auditável e reversível.
3. Executar lint/typecheck/build/testes e gates de segurança aplicáveis.
4. Se Firebase for afetado, manter Rules/Storage Rules/Functions/índices/configuração versionados no repositório e validar no Emulator ou gate equivalente antes de produção.
5. Entregar ao OpenAI Reviewer problema original, diff completo, arquivos alterados, testes, riscos, impactos Firebase/GitHub/Vercel e rollback.
6. REJECTED: corrigir automaticamente e repetir o ciclo.
7. APPROVED: merge/promoção/deploy podem seguir automaticamente conforme a política de branches, sem aprovação humana rotineira.
8. Fazer smoke test pós-deploy; em regressão atribuível, rollback para o último estado certificado.
9. Informar ao usuário o relatório final, evidências, estado e referência de rollback.

## Firebase
OpenClaw pode operar Firestore Rules, Storage Rules, Functions, índices, Emulator, logs, deploy seletivo e configuração não destrutiva de Firebase/Auth conforme a arquitetura existente. Evitar drift por mudanças feitas somente no Console. O Hub MillionsNest permanece autoridade de identidade, organizações, memberships, RBAC global, billing, assinaturas e entitlements.

## Proibido automaticamente
- excluir projeto Firebase/Google Cloud ou banco de produção;
- exclusão em massa irreversível de tenants/dados;
- alterar billing, IAM, owners ou escopo de service accounts;
- expor/commitar secrets, tokens ou chaves privadas;
- desabilitar backups, retenção ou auditoria;
- reescrever Git de forma destrutiva;
- criar bypass de Auth/RBAC/membership/multi-tenancy;
- migração destrutiva irreversível sem preservação e rollback comprovados.

## Engenharia versus decisões financeiras/de negócio
A autonomia técnica não muda a política funcional do NestFinance: IA não deve aprovar silenciosamente lançamentos, conciliações, documentos, reconhecimento financeiro ou decisões de negócio que o produto exige que uma pessoa confirme. O OpenAI Reviewer aprova engenharia e deploy, não substitui essas confirmações de domínio.
