import { firebaseAuth } from '@/src/lib/firebase';

export async function getBootstrapStatus(financeEntityId: string): Promise<any> {
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error('Não autenticado');

    const token = await user.getIdToken();
    const res = await fetch('/api/finance/entities/bootstrap/status', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ financeEntityId }),
        cache: 'no-store'
    });

    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Não foi possível consultar o status da estrutura financeira.');
    }

    return res.json();
}

export type BootstrapApplyRequest = {
  financeEntityId: string;
  templateId: 'church-br-v1' | 'obpc-br-v1';
  legacyAssignment: 'none' | 'assign_unscoped_to_this_entity';
  selection: {
    accountTemplateKeys: string[];
    fundTemplateKeys: string[];
    categoryTemplateKeys: string[];
    paymentMethodCodes: string[];
  };
  previewDigest: string;
  idempotencyKey: string;
};

export async function applyBootstrap(payload: BootstrapApplyRequest): Promise<any> {
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error('Não autenticado');

    const token = await user.getIdToken();
    
    // Setup explicit abort controller for configurable timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout

    try {
        const res = await fetch('/api/finance/entities/bootstrap/apply', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            cache: 'no-store',
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        let data = {};
        const textResponse = await res.text();
        try {
            data = textResponse ? JSON.parse(textResponse) : {};
        } catch {
             throw new Error('O servidor retornou uma resposta inválida.');
        }

        if (!res.ok) {
             const errorData: any = data;
             const err = new Error(errorData.error || 'Não foi possível concluir a preparação.');
             (err as any).code = errorData.code || 'UNKNOWN';
             (err as any).status = res.status;
             throw err;
        }

        return data;
    } catch (e: any) {
        clearTimeout(timeoutId);
        if (e.name === 'AbortError') {
             const err = new Error('A conexão demorou muito para responder. Verifique sua rede e tente novamente.');
             (err as any).code = 'NETWORK_TIMEOUT';
             throw err;
        }
        if (!e.status && !e.code) { // network error or parsing error
            (e as any).code = 'NETWORK_ERROR';
        }
        throw e;
    }
}

export async function previewBootstrap(payload: any): Promise<any> {
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error('Não autenticado');

    const token = await user.getIdToken();
    const res = await fetch('/api/finance/entities/bootstrap/preview', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        cache: 'no-store'
    });

    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Não foi possível gerar a prévia da estrutura.');
    }

    return res.json();
}
