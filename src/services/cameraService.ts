import type { CameraIP } from '../types/api';
import { apiFetch } from './apiClient';

export interface CreateCameraPayload {
  nombre: string;
  direccion_ip: string;
  ubicacion: string;
  descripcion?: string;
  activa: boolean;
  rtsp_usuario?: string;
  rtsp_password?: string;
  rtsp_puerto?: number;
  rtsp_canal?: number;
  rtsp_subtipo?: number;
  zona_exclusion_id?: number | null;
}

export const getCameras = (): Promise<CameraIP[]> =>
  apiFetch('/api/camaras');

export const createCamera = (data: CreateCameraPayload): Promise<CameraIP> =>
  apiFetch('/api/camaras', { method: 'POST', body: JSON.stringify(data) });

export interface UpdateCameraPayload {
  nombre?: string;
  direccion_ip?: string;
  ubicacion?: string;
  descripcion?: string;
  rtsp_usuario?: string;
  rtsp_password?: string;
  rtsp_puerto?: number;
  rtsp_canal?: number;
  rtsp_subtipo?: number;
}

// Solo se mandan los campos presentes en `data` — el backend deja el resto
// sin tocar (ej. no hace falta reenviar la contraseña RTSP para editar la IP).
export const updateCamera = (id: number, data: UpdateCameraPayload): Promise<CameraIP> =>
  apiFetch(`/api/camaras/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

export const updateCameraStatus = (id: number, activa: boolean): Promise<CameraIP> =>
  apiFetch(`/api/camaras/${id}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ activa }),
  });

export const updateCameraZona = (id: number, zona_exclusion_id: number | null): Promise<CameraIP> =>
  apiFetch(`/api/camaras/${id}/zona`, {
    method: 'PATCH',
    body: JSON.stringify({ zona_exclusion_id }),
  });

export const deleteCamera = (id: number): Promise<void> =>
  apiFetch(`/api/camaras/${id}`, { method: 'DELETE' });
