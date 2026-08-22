# AI Change Protocol

Este documento define o protocolo rigoroso que qualquer operador de IA deve seguir antes, durante e após mudanças técnicas no NestFinance. O fluxo atual utiliza ChatGPT e Codex; as regras abaixo independem da ferramenta.

## A — Antes de alterar

- Ler `AGENTS.md`, `README.md` e a documentação do domínio afetado.
- Inspecionar o código real antes de propor mudanças.
- Definir claramente o que está dentro e fora do escopo.
- Localizar implementações, contratos, testes e dependências relacionados.
- Identificar riscos a `organizationId`, `financeEntityId`, RBAC, Firestore, Vercel e integrações.
- Confirmar o comportamento atual com evidência.
- Definir critérios de aceite e gates necessários.
- Trabalhar em branch dedicada; `production` fica fora do escopo por padrão.

## B — Durante a alteração

- Fazer a menor mudança que resolva o problema.
- Não modificar arquivos sem necessidade.
- Não alterar contratos públicos sem necessidade comprovada.
- Reutilizar contexts, serviços, gateways e componentes existentes.
- Autorizações financeiras e de dados devem permanecer server-side.
- Preservar organização e entidade financeira canônicas; nunca permitir retarget por body/header quando o token/contexto já definiu a organização.
- Preservar o resolver canônico de sessão/capabilities; não criar fonte paralela de Auth, membership ou RBAC.
- Papel organizacional `owner` não deve ser promovido implicitamente a autoridade global.
- Todo texto novo visível deve manter PT/EN/ES.
- Considerar idempotência, concorrência e fail-closed em operações críticas.
- Não habilitar posting, OCR, IA ou processamento pago como efeito colateral de um slice que não os autorizou explicitamente.
- Não introduzir credenciais, dados reais, dumps ou identificadores operacionais de clientes em código/testes.

## C — Após a alteração

- Revisar o diff completo e procurar drift fora do escopo.
- Usar instalação reproduzível (`npm ci`) quando aplicável.
- Executar os testes específicos do slice.
- Executar lint/typecheck e build.
- Executar gates de contratos, entrypoints, isolamento SaaS e brand quando aplicáveis.
- Executar Firestore Emulator/Rules quando o domínio afetado exigir.
- Separar falhas preexistentes ou de infraestrutura de regressões reais de código.
- Revalidar multi-tenancy, RBAC, i18n, custos e efeitos colaterais.
- Registrar SHA/tree/diff e resultados verificáveis antes do merge.
- Promover por PR; promoção para `production` é decisão separada e explícita.

## D — Critérios de bloqueio

A mudança não pode ser considerada concluída quando houver:

- erro de build/typecheck introduzido;
- teste relevante falhando;
- drift não explicado;
- risco de mistura de organizações ou entidades;
- autorização crítica apenas no frontend;
- bypass por e-mail, UID, role ou valor hardcoded;
- segredo, credencial ou dado real exposto;
- fonte paralela de Auth/Hub/membership/RBAC;
- billing/entitlement duplicado ou manipulado fora do contrato;
- texto novo sem PT/EN/ES;
- side effect financeiro não autorizado;
- OCR/IA/posting ativado fora de um slice explicitamente certificado;
- ausência de evidência real de testes/build quando o gate é obrigatório.

## E — Repositório publicamente visível

Quando a visibilidade do repositório for pública:

- usar apenas fixtures sintéticos;
- não incluir IDs operacionais de clientes em scripts one-off;
- não publicar vulnerabilidades ou segredos em Issues/PRs;
- seguir `SECURITY.md`;
- lembrar que visibilidade pública não altera a licença proprietária descrita em `LICENSE.md`.
