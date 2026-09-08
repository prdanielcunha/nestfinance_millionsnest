import express from 'express';
import authGateway from './api/auth-gateway.js';
import financeGateway from './api/finance-gateway.js';
import systemGateway from './api/system-gateway.js';
import { NESTFINANCE_CLOUD_RUN_ROUTES, type NestFinanceGateway } from './cloudrunRoutes.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: false, limit: '4mb' }));

const gateways: Record<NestFinanceGateway, (req: any, res: any) => Promise<any>> = {
  auth: authGateway,
  finance: financeGateway,
  system: systemGateway,
};

for (const [path, route] of Object.entries(NESTFINANCE_CLOUD_RUN_ROUTES)) {
  app.all(path, async (req, res, next) => {
    try {
      (req.query as Record<string, unknown>).operation = route.operation;
      await gateways[route.gateway](req, res);
    } catch (error) {
      next(error);
    }
  });
}

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true, service: 'nestfinance-api' });
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'ROUTE_NOT_FOUND' });
});

app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[nestfinance-cloudrun]', {
    errorName: error?.name || 'Error',
    errorCode: error?.code || 'UNKNOWN',
    errorMessage: error?.message || 'Unknown error',
  });
  res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
});

const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`NestFinance API listening on 0.0.0.0:${PORT}`);
});
