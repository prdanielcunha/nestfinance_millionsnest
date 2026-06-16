/**
 * Toda variável prefixada por VITE_ deve ser tratada como pública,
 * pois pode ser incluída no bundle cliente. Credenciais privadas
 * nunca devem receber este prefixo.
 */
export const config = {
  appId: 'nestFinance',
  appName: 'NestFinance',
  platformName: 'MillionsNest',
  firebaseProjectId: 'millionsnest',
  hubUrl: undefined, // placeholder explícito, aguardando contrato
  handoffEndpoint: undefined, // placeholder explícito, aguardando contrato
  environment: import.meta.env.MODE || 'development',
};
