import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';
import { normalizeCnpj, isValidCnpj, getCnpjFormat, formatCnpj } from '../../../shared/finance/taxId.js';
import { CompanyRegistryProviderChain } from '../../providers/companyRegistry/CompanyRegistryProviderChain.js';
import { randomBytes } from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  const requestId = randomBytes(16).toString('hex');
  res.setHeader('X-NestFinance-Request-Id', requestId);
  
  const logDiagnosis = (outcome: string, provider: string, httpStatus: number, durationMs: number, errorCode?: string) => {
    console.log(JSON.stringify({
      event: 'finance_entity_cnpj_lookup',
      requestId,
      provider,
      outcome,
      httpStatus,
      durationMs,
      errorCode
    }));
  };

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const contentType = req.headers['content-type'];
  if (!contentType || !contentType.includes('application/json')) {
    return res.status(415).json({ error: 'UNSUPPORTED_MEDIA_TYPE' });
  }

  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > 2048) {
    return res.status(413).json({ error: 'PAYLOAD_TOO_LARGE' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  let admin;
  try {
    admin = getFirebaseAdmin();
  } catch (err: any) {
    if (err.message === 'MISSING_FIREBASE_CREDENTIALS') {
      return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
    }
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }

  const { auth } = admin;

  const startTime = Date.now();

  try {
    const decodedToken = await auth.verifyIdToken(idToken, true);

    const uid = decodedToken.uid;
    const organizationId = decodedToken.mn_organization_id;

    if (!organizationId || typeof organizationId !== 'string') {
      return res.status(403).json({ error: 'FORBIDDEN_MISSING_ORG' });
    }

    const sessionList = await resolveEcosystemSession(uid, organizationId);
    if (!sessionList.granted) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    if (sessionList.isGlobalAccess !== true) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'INVALID_PAYLOAD' });
    }

    const { taxId } = req.body;

    if (!taxId || typeof taxId !== 'string') {
      logDiagnosis('error', 'none', 400, Date.now() - startTime, 'INVALID_TAX_ID');
      return res.status(400).json({ error: 'INVALID_TAX_ID' });
    }

    const normalized = normalizeCnpj(taxId);
    if (!isValidCnpj(normalized)) {
       logDiagnosis('error', 'none', 400, Date.now() - startTime, 'INVALID_TAX_ID');
       return res.status(400).json({ error: 'INVALID_TAX_ID' });
    }

    // Pass abort controller to the chain to clean up memory
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 9000); // give the chain 9 secs to complete max before outer limit

    const provider = new CompanyRegistryProviderChain();
    
    try {
      const result = await provider.lookupCnpj(normalized, controller.signal);
      clearTimeout(timeout);
      
      logDiagnosis('success', result.provider, 200, Date.now() - startTime);

      return res.status(200).json({
        found: true,
        provider: result.provider,
        providerDataset: result.providerDataset,
        queriedAt: new Date().toISOString(),
        entity: {
            taxId: result.taxId,
            taxIdFormatted: formatCnpj(result.taxId),
            legalName: result.legalName,
            tradeName: result.tradeName,
            registrationStatus: result.registrationStatus,
            registrationStatusDate: result.registrationStatusDate,
            openingDate: result.openingDate,
            legalNatureCode: result.legalNatureCode,
            legalNatureDescription: result.legalNatureDescription,
            primaryActivityCode: result.primaryActivityCode,
            primaryActivityDescription: result.primaryActivityDescription,
            registeredAddress: result.registeredAddress
        },
        warning: 'CONFIRM_BEFORE_SAVE'
      });
    } catch (providerError: any) {
      clearTimeout(timeout);
      
      const isNotFound = providerError.message === 'REGISTRY_NOT_FOUND';
      
      logDiagnosis('error', 'chain', isNotFound ? 404 : 503, Date.now() - startTime, providerError.message);
      
      return res.status(isNotFound ? 404 : 503).json({
          found: false,
          reason: isNotFound ? 'NOT_FOUND' : 'PROVIDER_UNAVAILABLE',
          requestId
      });
    }
  } catch (error: any) {
    if (error.code === 'auth/argument-error' || error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    
    // Do not log the entire error in production due to sensitive fields
    console.error(`Cnpj Lookup error for request ${requestId}:`, error.code || error.message);
    logDiagnosis('error', 'none', 500, Date.now() - startTime, 'INTERNAL_SERVER_ERROR');
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', requestId });
  }
}
