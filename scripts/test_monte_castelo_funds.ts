import { VercelRequest, VercelResponse } from '@vercel/node';
import accountsListHandler from '../server/vercel-handlers/finance/accountsList.js';
import fundsListHandler from '../server/vercel-handlers/finance/fundsList.js';
import { getFirebaseAdmin } from '../api/_lib/firebaseAdmin.js';

function mockRes() {
    let statusCode = 200;
    let body: any = null;
    return {
        setHeader: () => {},
        status: (code: number) => {
            statusCode = code;
            return {
                json: (data: any) => { body = data; }
            }
        },
        _getStatusCode: () => statusCode,
        _getBody: () => body
    } as unknown as VercelResponse;
}

async function main() {
    const admin = getFirebaseAdmin();
    const MOCK_UID = 'w2m4E82A1wQosVf6T9yX8xK19883'; // Use realistic UID if needed
    const ORG_ID = 'JPrzMnxJu77hTLJtu7FT';
    
    // We need to mock verifyIdToken
    const auth = admin.auth;
    const oldVerify = auth.verifyIdToken;
    auth.verifyIdToken = async () => ({ uid: MOCK_UID, mn_organization_id: ORG_ID }) as any;
    
    const req = {
        method: 'POST',
        headers: { authorization: 'Bearer dummy' },
        body: { financeEntityId: 'fent_a0bd282f802e53dc4eeb6e7665ed2ba4' }
    } as unknown as VercelRequest;
    
    const res = mockRes();
    await fundsListHandler(req, res);
    
    console.log('FUNDS RESPONSE:', (res as any)._getStatusCode(), (res as any)._getBody());
}

main().catch(console.error);
