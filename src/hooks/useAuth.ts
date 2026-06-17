import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { firebaseAuth } from '../lib/firebase';
import { EcosystemAccessState } from '../types/access';
import { resolveEcosystemSession } from '../services/sessionResolutionService';

type AuthState = 'initializing' | 'authenticated' | 'unauthenticated' | 'error';

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>('initializing');
  const [accessState, setAccessState] = useState<EcosystemAccessState>({ status: 'initializing' });
  const [user, setUser] = useState<User | null>(null);
  const requestCounter = useRef(0);

  useEffect(() => {
    try {
      const unsubscribe = onAuthStateChanged(
        firebaseAuth,
        async (currentUser) => {
          setUser(currentUser);
          requestCounter.current += 1;
          const currentRequest = requestCounter.current;

          if (!currentUser) {
            setAuthState('unauthenticated');
            setAccessState({ status: 'unauthenticated' });
            return;
          }

          setAuthState('authenticated');
          setAccessState({ status: 'authenticated_unresolved' });

          const result = await resolveEcosystemSession();

          if (requestCounter.current === currentRequest) {
            setAccessState(result);
          }
        },
        (error) => {
          console.error("Erro no observador de autenticação");
          setAuthState('error');
          setAccessState({ status: 'error' });
        }
      );
      
      return () => unsubscribe();
    } catch (e) {
      console.error("Falha ao inicializar observador de autenticação");
      setAuthState('error');
      setAccessState({ status: 'error' });
    }
  }, []);

  return { authState, user, accessState };
}
