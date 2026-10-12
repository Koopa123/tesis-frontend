import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { LoginRequest, RegisterRequest, User, UserRole } from '../types/auth';
import { getMeRequest, loginRequest, registerRequest } from '../services/authService';

const TOKEN_KEY = 'token';
const USER_KEY = 'usuario';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isVigilante: boolean;
  login: (req: LoginRequest) => Promise<void>;
  register: (req: RegisterRequest) => Promise<void>;
  logout: () => void;
  validateSession: () => Promise<void>;
  hasRole: (role: UserRole) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const saveSession = useCallback((newToken: string, newUser: User) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const validateSession = useCallback(async () => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (!storedToken) {
      setIsLoading(false);
      return;
    }
    try {
      const validUser = await getMeRequest(storedToken);
      setToken(storedToken);
      setUser(validUser);
      localStorage.setItem(USER_KEY, JSON.stringify(validUser));
    } catch (err) {
      // Si /auth/me responde 401 o falla, limpiar sesión
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'UNAUTHORIZED' || msg.includes('401')) {
        clearSession();
      }
    } finally {
      setIsLoading(false);
    }
  }, [clearSession]);

  // Validar sesión almacenada al montar
  useEffect(() => {
    void validateSession();
  }, [validateSession]);

  const login = useCallback(
    async (req: LoginRequest) => {
      const { token: newToken, usuario } = await loginRequest(req);
      saveSession(newToken, usuario);
    },
    [saveSession]
  );

  const register = useCallback(
    async (req: RegisterRequest) => {
      // La cuenta nueva queda pendiente de activación: no se abre sesión.
      await registerRequest(req);
    },
    []
  );

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const hasRole = useCallback(
    (role: UserRole): boolean => user?.rol === role,
    [user]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated: !!user && !!token,
      isAdmin: user?.rol === 'administrador',
      isVigilante: user?.rol === 'vigilante',
      login,
      register,
      logout,
      validateSession,
      hasRole,
    }),
    [user, token, isLoading, login, register, logout, validateSession, hasRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
