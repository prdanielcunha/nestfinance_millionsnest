# NestFinance - Brand Integration

## 1. Identidade Aprovada
- **Nome da Marca:** NestFinance
- **Conceito:** Nest Flow Signature
- **Tagline:** Controle. Clareza. Confiança.

## 2. Pasta-Fonte
`NestFinance_Nest_Flow_Signature_Kit_Completo_v1`

## 3. Pasta Pública de Destino
`/brand/nestfinance/nest-flow-signature/v1/`

## 4. Tabela de Assets
Consulte o arquivo `public/brand/nestfinance/nest-flow-signature/v1/brand-assets.json` para o manifesto completo de dimensões e transparências.

## 5 a 7. Recomendações e Propriedades
- Os assets estão disponíveis em formatos SVG e PNG/JPG conforme a aplicabilidade de UI e mídia.
- Transparência é nativamente preservada em SVGs.
- A paleta de cores (Cyan, Gold, Slate, Ivory) deve guiar a identidade sem substituir cores funcionais.

## 8. Uso Atual
Os SVGs horizontais foram alocados nos headers (com/sem tagline). O símbolo isolado compõe menus mobile, avatares internos e ícones de loading/splash. O ícone 192 e 512 foi adicionado ao manifesto PWA. O Open Graph 1200x630 é utilizado em index.html. 

## 9. Uso Futuro
A pasta `social/` contém assets 1080x1080, 1080x1920 (Story), 1584x396 (LinkedIn), 1500x500 (X) e 2560x1440 (YouTube) sem a criação proativa de URLs ou handles. Estes ativos devem ser usados caso venham a ser criadas páginas institucionais no futuro.

## 10. Telas e Componentes Aplicados
- Header Desktop e Mobile (`<NestFinanceLogo />`)
- Autenticação e Loading
- Favicon e metadados (`index.html`)

## 11. Arquivos Legados Substituídos
Logo_transp.png e outros assets legados.

## 12. Regras Proibidas
- É proibido redesenhar a logo, usar a prancha mestra como UI asset, deformar o ratio, criar variações falsas ou adicionar um background ao arquivo SVG onde já não há.

## 13. Redes Sociais Futuras
Os arquivos existem fisicamente em `social/` no public, prontos para uso futuro. Não existem páginas de destino atualmente.

## 14. Instruções PWA
O `site.webmanifest` está integrado com ícones de `192x192`, `512x512` e ícones com property "maskable". Não foi criado service-worker desnecessariamente.

## 15. Instruções Open Graph
Foram preenchidas corretamente as tags `<meta property="og:image" content="...">` visando a dimensão 1200x630px.

## 16. Checklist de Validação
`npm run check:brand-assets` assegura integridade, referências e a presença física dos arquivos de imagem corretos.
