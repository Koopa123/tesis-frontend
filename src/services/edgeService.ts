import type { EstadoCamaraEdge } from '../types/api';
import { apiFetch } from './apiClient';

interface EstadoCamarasResponse {
  camaras: EstadoCamaraEdge[];
}

export const getEstadoCamaras = async (): Promise<EstadoCamaraEdge[]> => {
  const data = await apiFetch<EstadoCamarasResponse>('/api/edge/estado');
  return data.camaras;
};

export const getEvidenciaCamara = (camaraId: number): Promise<{ camara_id: number; frame_evidencia_b64: string }> =>
  apiFetch(`/api/edge/estado/${camaraId}/evidencia`);
