# ADR-001: Posicionamento do NestFinance

## Contexto e Premissas

Foi definido que o **NestFinance** operará como um aplicativo independente dentro da plataforma MillionsNest, paralelamente ao MusicScale. A plataforma (Hub) age como o cérebro central para identidade e acessos.

## Decisões Arquitetônicas

1. **Independência Operacional**: O NestFinance funcionará em um repositório separado, com pipeline de deploy separado (Vercel) e domínio próprio.
2. **Firebase Compartilhado**: Para assegurar uma identidade única, o NestFinance utiliza o mesmo projeto Firebase de produção (`millionsnest`). 
   - A configuração inclui a API key e outros identificadores do client para Web.
   - Nenhuma credencial administrativa ou service account foi ou será adicionada ao código do cliente.
3. **Identidade e Autorização Canônica**: A plataforma manterá como únicas fontes da verdade:
   - Identidade imutável: Firebase Auth UID (`/users/{uid}`)
   - Organizações e domínios de tenant (`/organizations/{organizationId}`)
   - Memberships e papéis (`/organizations/{organizationId}/members/{uid}`)
   - Entitlements e instalações de aplicativo.
4. **Isolamento de Domínio Financeiro**: O NestFinance utilizará namespace financeiro próprio para estruturas exclusivas de gestão sem misturar com logs ou operações não-financeiras do MusicScale.
5. **Autenticação via Handoff**: **Não existirá login paralelo ou cadastro de conta direto pelo NestFinance**. A autenticação fluirá estritamente via redirecionamento de uso único do Hub e troca server-side no backend do NestFinance via Custom Token. O frontend servirá um estado bloqueado enquanto aguarda handoff válido.
6. **Integrações (Analytics e App Check)**: Analytics e App Check permanecerão opcionalmente preparados, mas sua inicialização foi inibida neste estágio inicial para viabilizar conformidade isolada posterior sem colidir com exigências prematuras no ecossistema MillionsNest.
