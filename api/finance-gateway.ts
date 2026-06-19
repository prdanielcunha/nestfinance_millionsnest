import type { VercelRequest, VercelResponse } from '@vercel/node';

import setupInitialize from '../server/vercel-handlers/finance/setupInitialize.js';
import accountsList from '../server/vercel-handlers/finance/accountsList.js';
import accountsCreate from '../server/vercel-handlers/finance/accountsCreate.js';
import accountsArchive from '../server/vercel-handlers/finance/accountsArchive.js';
import accountsReactivate from '../server/vercel-handlers/finance/accountsReactivate.js';
import accountsUpdate from '../server/vercel-handlers/finance/accountsUpdate.js';
import fundsList from '../server/vercel-handlers/finance/fundsList.js';
import fundsCreate from '../server/vercel-handlers/finance/fundsCreate.js';
import fundsArchive from '../server/vercel-handlers/finance/fundsArchive.js';
import fundsReactivate from '../server/vercel-handlers/finance/fundsReactivate.js';
import categoriesList from '../server/vercel-handlers/finance/categoriesList.js';
import categoriesCreate from '../server/vercel-handlers/finance/categoriesCreate.js';
import categoriesArchive from '../server/vercel-handlers/finance/categoriesArchive.js';
import categoriesReactivate from '../server/vercel-handlers/finance/categoriesReactivate.js';
import categoriesUpdate from '../server/vercel-handlers/finance/categoriesUpdate.js';
import entitiesCnpjLookup from '../server/vercel-handlers/finance/entitiesCnpjLookup.js';
import entitiesCreate from '../server/vercel-handlers/finance/entitiesCreate.js';
import entitiesList from '../server/vercel-handlers/finance/entitiesList.js';
import entitiesUpdate from '../server/vercel-handlers/finance/entitiesUpdate.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  let operation = req.query.operation;
  if (Array.isArray(operation)) {
    operation = operation[0];
  }

  if (req.query) {
    delete req.query.operation;
  }

  switch (operation) {
    case 'setup-initialize':
      return setupInitialize(req, res);
    case 'accounts-list':
      return accountsList(req, res);
    case 'accounts-create':
      return accountsCreate(req, res);
    case 'accounts-archive':
      return accountsArchive(req, res);
    case 'accounts-reactivate':
      return accountsReactivate(req, res);
    case 'accounts-update':
      return accountsUpdate(req, res);
    case 'funds-list':
      return fundsList(req, res);
    case 'funds-create':
      return fundsCreate(req, res);
    case 'funds-archive':
      return fundsArchive(req, res);
    case 'funds-reactivate':
      return fundsReactivate(req, res);
    case 'categories-list':
      return categoriesList(req, res);
    case 'categories-create':
      return categoriesCreate(req, res);
    case 'categories-archive':
      return categoriesArchive(req, res);
    case 'categories-reactivate':
      return categoriesReactivate(req, res);
    case 'categories-update':
      return categoriesUpdate(req, res);
    case 'entities-cnpj-lookup':
      return entitiesCnpjLookup(req, res);
    case 'entities-create':
      return entitiesCreate(req, res);
    case 'entities-list':
      return entitiesList(req, res);
    case 'entities-update':
      return entitiesUpdate(req, res);
    default:
      return res.status(404).json({ error: 'ROUTE_NOT_FOUND' });
  }
}
