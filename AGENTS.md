# Diretrizes para Agentes de IA — NestFinance

Este repositório pertence ao NestFinance, parte do ecossistema MillionsNest.

## Operadores atuais

O fluxo atual de engenharia usa **ChatGPT + Codex**. Não existe autorização especial para Google AI Studio neste repositório.

Qualquer operador humano ou de IA deve trabalhar com disciplina repository-first, em branch de escopo pequeno, com revisão e gates antes de promoção. `production` nunca deve ser alterada incidentalmente.

## Leitura obrigatória

Antes de modificar código:
1. Leia `AGENTS.md` e `README.md`.
2. Leia `docs/ARCHITECTURE_CURRENT.md` e a documentação relevante ao slice.
3. Localize a implementação real, gateways/handlers/UI envolvidos.
4. Localize testes e verificações existentes.
5. Identifique impacto em Auth, multi-tenancy, RBAC, Firestore, Vercel e i18n.
6. Só então proponha ou implemente a menor mudança necessária.

## Fonte da verdade

Prioridade:
1. código implementado (`/server`, `/api`, `/src`, `/shared`);
2. testes, contratos e scripts de certificação;
3. documentação técnica;
4. configuração (`package.json`, `vercel.json`, `firebase.json`).

Se documentação e código divergirem, investigue. Não invente comportamento.

## Regras de desenvolvimento

- Escopo mínimo; sem refatorações oportunistas.
- Não alterar o que já funciona sem necessidade demonstrada.
- Reutilizar serviços, contexts, gateways e componentes existentes.
- Nunca criar bypass por e-mail, UID, role ou valor hardcoded.
- Autorizações críticas sempre server-side.
- Todo texto novo visível deve suportar PT/EN/ES.
- Não criar fonte paralela de Auth, Hub, memberships, organizations ou RBAC.
- Não habilitar posting real, OCR ou IA como efeito colateral de outro slice.
- Não introduzir secrets, dados reais, dumps ou IDs operacionais de clientes em fixtures/scripts.

## Segurança crítica

### Handoff / identidade
Autenticação e sessão vêm do Hub MillionsNest. Claims do frontend não bastam como autorização.

### Multi-tenancy
`organizationId` e `financeEntityId` são fronteiras de segurança. Leituras e writes devem ficar presos ao contexto canônico resolvido no backend.

### RBAC
O resolver canônico de sessão/capabilities é a fonte de autoridade. Papel organizacional `owner` não deve ser confundido com papel global.

### Universal Evidence
Acesso deve continuar server-mediated, entity-scoped e fail-closed. Não expor path privado de Storage, SHA, UID interno ou binário sem autorização explícita.

## Repositório visível publicamente

A visibilidade pública não torna o projeto open source. `LICENSE.md` é proprietária.

Nunca comite:
- `.env` real;
- API keys, tokens ou private keys;
- service-account JSON;
- Firebase Admin credentials;
- dados pessoais;
- comprovantes/documentos reais;
- IDs operacionais de clientes usados em scripts one-off;
- dumps/logs de produção.

Use somente fixtures sintéticos e IDs explicitamente fictícios em testes.

## Comandos

Use comandos existentes no `package.json`. Para instalação limpa/release/CI, prefira:

```bash
npm ci
```

Gates típicos:

```bash
npm run test:certification-gates
npm run lint
npm run build
npm run check:api-contracts
npm run check:vercel-entrypoints
npm run check:saas-isolation
npm run check:brand-assets
```

Execute suites específicas do domínio alterado, inclusive Emulator/Rules quando aplicável.

## Git / promoção

- `main`: desenvolvimento/homologação integrada.
- `production`: produção, fora do escopo por padrão.
- Implementações devem usar branch dedicada + PR.
- Antes do merge, prove SHA/tree/diff e gates relevantes.
- Não faça force-push, rebase destrutivo ou reescrita de histórico sem necessidade explícita e revisão do impacto.

## Definition of Done

Uma mudança só está pronta quando:
- o escopo está completo;
- não há drift incidental;
- testes relevantes passaram com evidência real;
- lint/build e contratos aplicáveis passaram;
- Auth/RBAC/multi-tenancy permanecem íntegros;
- PT/EN/ES está completo quando houver UI;
- custos e side effects permanecem dentro do contrato do slice;
- riscos residuais estão documentados.

## Quando houver dúvida

Investigue código, testes e documentação. Se ainda não houver evidência suficiente, marque como não confirmado. Não preencha lacunas com suposição.
