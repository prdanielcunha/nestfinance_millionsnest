import { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { firebaseAuth } from '../lib/firebase';

type AuthState = 'initializing' | 'authenticated' | 'unauthenticated' | 'error';

/**
 * O NestFinance não implementa login próprio e não configurou manualmente
 * uma política de persistência nesta fase. A aplicação apenas observa o
 * estado do Firebase Auth. A política de persistência definitiva será
 * estabelecida junto ao handoff seguro entre Hub e NestFinance.
 */
export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>('initializing');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    try {
      const unsubscribe = onAuthStateChanged(
        firebaseAuth,
        (currentUser) => {
          setUser(currentUser);
          setAuthState(currentUser ? 'authenticated' : 'unauthenticated');
        },
        (error) => {
          console.error("Erro no observador de autenticação");
          setAuthState('error');
        }
      );
      
      return () => unsubscribe();
    } catch (e) {
      console.error("Falha ao inicializar observador de autenticação");
      setAuthState('error');
    }
  }, []);

  return { authState, user };
}
