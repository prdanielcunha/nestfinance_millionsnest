# Contrato Pendente: Integração de Login com MillionsNest Hub

Para que o NestFinance consiga autenticar os usuários com segurança sem expor um painel paralelo de credenciais, dependemos de definições técnicas no aplicativo Hub.

Os seguintes pontos precisam ser definidos e implementados de forma coordenada entre Hub e NestFinance nas próximas fases:

1. O Hub autentica o usuário.
2. O Hub resolve organização, membership, instalação, entitlement, appAccess, permissions e scopes.
3. O Hub cria um código opaco, aleatório, curto, expirável e de uso único.
4. Apenas o hash do código é armazenado server-side.
5. O navegador é redirecionado ao NestFinance com o código.
6. O NestFinance remove o código da URL e envia-o ao backend de resgate.
7. O backend valida expiração, uso único, origem, organização, usuário, sessão e proteção contra replay.
8. O código é consumido atomicamente.
9. Um servidor autorizado cria um Firebase Custom Token para o UID validado.
10. O cliente utiliza signInWithCustomToken().
11. O NestFinance recarrega as fontes canônicas e não confia em roles ou permissions vindas da URL.

Decisões pendentes:
- coleção ou datastore do código de uso único;
- nome dos endpoints;
- TTL;
- proteção contra replay;
- binding com sessionVersion;
- binding com organização;
- auditoria;
- rate limit;
- CORS;
- App Check;
- comportamento de logout;
- troca de organização;
- retorno ao Hub.
