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
