import type { AuthResponse, LoginRequest, RegisterRequest, User } from '../types/auth';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

// ─────────────────────────────────────────────
// POST /auth/login
// Payload: { email, password }
// Response: { token, usuario }
// ─────────────────────────────────────────────
export async function loginRequest(req: LoginRequest): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (res.status === 401) throw new Error('Credenciales incorrectas.');
  if (res.status === 429) throw new Error('Demasiados intentos fallidos. Espera un minuto e inténtalo de nuevo.');
  if (!res.ok) throw new Error('Error al iniciar sesión. Intenta de nuevo.');
  return res.json() as Promise<AuthResponse>;
}

// ─────────────────────────────────────────────
// POST /auth/registro
// Payload: { nombre, email, password }
// Response: { mensaje }
// El backend asigna rol "vigilante" y deja la cuenta desactivada
// hasta que un administrador la active (no devuelve token).
// El frontend nunca envía ni permite elegir rol.
// ─────────────────────────────────────────────
export async function registerRequest(req: RegisterRequest): Promise<void> {
  const res = await fetch(`${API_URL}/auth/registro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (res.status === 409) throw new Error('Ya existe una cuenta con ese correo.');
  if (!res.ok) throw new Error('Error al crear la cuenta. Intenta de nuevo.');
}

// ─────────────────────────────────────────────
// GET /auth/me
// Header: Authorization: Bearer <token>
// Response: { id, nombre, email, rol }
// ─────────────────────────────────────────────
export async function getMeRequest(token: string): Promise<User> {
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error('Error al validar sesión.');
  return res.json() as Promise<User>;
}
