export interface CameraIP {
  id: number;
  nombre: string;
  direccion_ip: string;
  ubicacion: string;
  descripcion: string | null;
  activa: boolean;
  fecha_registro: string | null;
  rtsp_usuario: string;
  rtsp_tiene_password: boolean;
  rtsp_puerto: number;
  rtsp_canal: number;
  rtsp_subtipo: number;
  zona_exclusion_id: number | null;
}

export type VideoSourceType = 'webcam' | 'grabacion_previa' | 'camara_ip';

export interface VideoSource {
  tipo: VideoSourceType;
  nombre: string;
  disponible: boolean;
  nota?: string | null;
}

export interface VideoSourcesResponse {
  fuentes_disponibles: VideoSource[];
  camaras_ip: CameraIP[];
}

export interface Recording {
  id: number;
  nombre_archivo: string;
  ruta_archivo: string;
  tipo_contenido: string | null;
  tamanio_bytes: number | null;
  usuario_id: number | null;
  fecha_carga: string | null;
  fecha_grabacion: string | null;
}

export interface RecordingsListResponse {
  grabaciones: Recording[];
}

export interface MonitoringSession {
  id: number;
  estado: 'activo' | 'detenido';
  tipo_fuente: VideoSourceType;
  zona_exclusion_id: number | null;
  mensaje: string;
}

// ── Análisis EP-003 ───────────────────────────────────────────────────────────

export interface DetectionBox {
  x1: number;  // normalizado 0-1
  y1: number;
  x2: number;
  y2: number;
  conf: number;
  excluida: boolean;
}

export type NivelAglomeracion = 'sin_aglomeracion' | 'bajo' | 'medio' | 'alto';

export interface FrameAnalysisResult {
  sesion_id: number;
  personas: number;
  nivel: NivelAglomeracion;
  alerta: boolean;
  detecciones: DetectionBox[];
  personas_maximas: number;
  nivel_maximo: NivelAglomeracion;
  tiempo_primera_media_seg: number | null;
  alerta_activada: boolean;
}

export interface AnalysisResult {
  id: number;
  sesion_id: number;
  zona_config_id: number | null;
  zona_nombre: string | null;
  personas_maximas: number;
  nivel_maximo: NivelAglomeracion;
  tiempo_primera_media_seg: number | null;
  alerta_activada: boolean;
  frames_procesados: number;
  inicio_analisis: string | null;
  fin_analisis: string | null;
  fecha_registro: string | null;
  frame_evidencia: string | null;
  tipo_dia: string | null;
}

// ── Zonas críticas EP-005 ─────────────────────────────────────────────────────

export interface ZonaCritica {
  zona_id: number;
  zona_nombre: string;
  total_sesiones: number;
  sesiones_con_alerta: number;
  max_personas: number;
  promedio_personas: number;
}

export interface ZonasCriticasResponse {
  zonas: ZonaCritica[];
}

export interface VideoSSEEvent {
  tipo: 'frame' | 'fin' | 'error';
  // frame
  frame_num?: number;
  total_frames?: number;
  progreso?: number;
  timestamp_video?: number;
  personas?: number;
  nivel?: NivelAglomeracion;
  alerta?: boolean;
  detecciones?: DetectionBox[];
  // fin
  personas_maximas?: number;
  nivel_maximo?: NivelAglomeracion;
  tiempo_primera_media_seg?: number | null;
  alerta_activada?: boolean;
  frames_procesados?: number;
  // error
  mensaje?: string;
}

// ── Alertas EP-004 ────────────────────────────────────────────────────────────

export interface Alerta {
  id: number;
  sesion_id: number | null;     // null = reportada por el edge (laptop del local), sin sesión de navegador
  usuario_id: number | null;
  zona_config_id: number | null;
  nivel: 'bajo' | 'medio' | 'alto';
  personas: number;
  atendida: boolean;
  fecha_alerta: string | null;
  fecha_atencion: string | null;
  camara_id?: number | null;
  camara_nombre?: string | null;
}

export interface AlertaSSEEvent {
  tipo: 'alerta';
  id: number;
  sesion_id: number | null;
  camara_id?: number | null;
  camara_nombre?: string | null;
  nivel: 'alto';
  personas: number;
  fecha_alerta: string | null;
}

// ── Edge (laptop en el local) ─────────────────────────────────────────────────

export interface EstadoCamaraEdge {
  camara_id: number;
  camara_nombre: string;
  ubicacion: string;
  zona_config_id: number | null;
  personas: number;
  nivel: 'sin_aglomeracion' | 'bajo' | 'medio' | 'alto';
  alerta_activa: boolean;
  tiene_evidencia: boolean;
  fecha_actualizacion: string | null;
}
