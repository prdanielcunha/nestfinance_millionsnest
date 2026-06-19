
        export async function resolveEcosystemSession(uid: string, orgId: string) {
            return (globalThis as any).fakeSessionResolver(uid, orgId);
        }
    