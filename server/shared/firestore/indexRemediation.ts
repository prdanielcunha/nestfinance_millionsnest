export type FirestoreInfrastructureError = {
  code: 'FIRESTORE_INDEX_REQUIRED';
  requestId: string;
  operation: string;
  retryable: boolean;
  indexCreateUrl?: string;
};

export function normalizeFirestoreInfrastructureError(
  error: any,
  context: { requestId: string; operation: string; isGlobalAdmin: boolean }
): FirestoreInfrastructureError | null {
  const isFailedPrecondition = error?.code === 9 || error?.code === 'failed-precondition';
  const message = error?.message || error?.details || '';
  
  if (!isFailedPrecondition && !message.includes('The query requires an index')) {
    return null; // Not an index error
  }

  const result: FirestoreInfrastructureError = {
    code: 'FIRESTORE_INDEX_REQUIRED',
    requestId: context.requestId,
    operation: context.operation,
    retryable: true,
  };

  if (context.isGlobalAdmin) {
    const urlMatch = message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/) || message.match(/https:\/\/console\.cloud\.google\.com[^\s]+/);
    if (urlMatch) {
        try {
            const parsedUrl = new URL(urlMatch[0]);
            if (
                parsedUrl.protocol === 'https:' && 
                (parsedUrl.hostname === 'console.firebase.google.com' || parsedUrl.hostname === 'console.cloud.google.com') &&
                parsedUrl.pathname.includes('firestore/indexes') || parsedUrl.pathname.includes('firestore/databases') // The paths might vary slightly depending on exactly what google returns
            ) {
                 result.indexCreateUrl = parsedUrl.toString();
            }
        } catch(e) {
            // URL parse failed, do not expose
        }
    }
  }

  // Never expose full stack, raw message, or token parts
  return result;
}
