# NestFinance — reconciliação segura do histórico main/production (15/10/2026)

## Escopo e evidência
* Base preservada para novo merge: `main` 5eb50e6db6e333c7f37f7d951c1deab708dc3265 (tree 79ee8d3f98a5435e297ebe465bdc98b49f5f7232).
* Histórico operacional de origem: `production` eb0b04b18dd3201e87b9aa72437e9aff3b50cb03.
* Ancestral conjunto: `ee8c1cba4cb98677ac5db5645009a2ac5db5956c`.
* Comparados os objetos Git (blobs) de todos os arquivos alterados pela produção desde o ancestral: **25**, dos quais **22** já idênticos em main; **zero** arquivos presentes apenas em production, **zero** arquivos removidos em production.
* Os três arquivos intencionalmente mais recentes em main são: `.github/workflows/nestfinance-connect-summary-quality.yml` (a mesma restrição de escopo Connect com condicionamento do CI), `package.json` (testes adicionais), `src/app/layouts/ShellLayout.tsx` (UI de funções Contagem/Tesouraria/Contador).
* A proteção de Cloud Run com `--no-traffic`, SHA e rollback foi restaurada via PR #255. A restrição de Firestore compartilhado do Hub foi restaurada literalmente da produção com seu teste de política via PR #260; estes blobs estavam iguais antes deste merge de históricos.
* O commit com dois pais mantém o *tree* da main, exceto este relatório de reconciliação. Assim, o conteúdo de produção já auditado não é sobreposto por implementações antigas e ambos os históricos permanecem como ancestrais.

## Critérios para release
1. Confirmar que a PR de união de históricos contém somente este relatório como diferença de conteúdo de main e que o commit possui dois pais.
2. Executar CI relevante. Em seguida, promover main para production por PR revisada e certificação da versão exata, sem force-push nem migração de dados.
3. A action de release fará pré-flight, imagem imutável, nova revisão sem tráfego, smoke, rollback de Cloud Run/Hosting e validação apenas leitura das regras compartilhadas.
4. Confirmar o SHA vivo; se a publicação falhar, não anunciar produção atualizada. Se a PR criar commit diferente em production, sincronizar main por fast-forward não destrutivo.

## Limites do escopo
Sincronizar código não implementa E01–E08 da especificação: posting contábil real, saldo por conta, obrigações, repasses, fechamento, modo acompanhado, contabilidade profissional certificada, auditoria visual e pilotos reais ainda precisam de seus próprios contratos, testes e certificação. Nenhuma integração financeira é habilitada por este documento.
