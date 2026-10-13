import { apiFetch } from './apiClient';

export interface UsuarioAdmin {
  id: number;
  nombre: string;
  email: string;
  rol: 'administrador' | 'vigilante';
  activo: boolean;
  fecha_creacion: string | null;
}

// Solo administrador. Las cuentas desactivadas (pendientes de activación) vienen primero.
export const getUsuarios = (): Promise<UsuarioAdmin[]> => apiFetch('/api/usuarios');

export const setEstadoUsuario = (id: number, activo: boolean): Promise<UsuarioAdmin> =>
  apiFetch(`/api/usuarios/${id}/estado`, { method: 'PATCH', body: JSON.stringify({ activo }) });

// Solo cuentas desactivadas y sin registros (un registro rechazado).
export const rechazarUsuario = (id: number): Promise<void> =>
  apiFetch(`/api/usuarios/${id}`, { method: 'DELETE' });
