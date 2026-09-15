import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  VideoSourceType,
  VideoSourcesResponse,
  MonitoringSession,
  Recording,
  FrameAnalysisResult,
  DetectionBox,
  NivelAglomeracion,
  VideoSSEEvent,
} from '../../types/api';
import type { ExclusionRect, ExclusionZoneConfig } from '../../types/zones';
import { getVideoSources, selectVideoSource } from '../../services/videoSourceService';
import { getRecordings, uploadRecording, deleteRecording } from '../../services/recordingService';
import { startMonitoring, stopMonitoring } from '../../services/monitoringService';
import { getExclusionZones } from '../../services/exclusionZoneService';
import { analyzeFrame, streamVideoAnalisis } from '../../services/analisisService';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

type Step = 'select' | 'confirmed' | 'active' | 'stopped';

type NivelColor = { bg: string; text: string; border: string; label: string };
const NIVEL_STYLE: Record<NivelAglomeracion, NivelColor> = {
  sin_aglomeracion: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', label: 'Sin aglomeración' },
  bajo:             { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200', label: 'Bajo' },
  medio:            { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', label: 'Medio' },
  alto:             { bg: 'bg-red-100',   text: 'text-red-700',   border: 'border-red-200',   label: 'Alto' },
};

const SOURCE_INFO: Record<VideoSourceType, { icon: string; title: string; description: string; note?: string }> = {
  webcam: {
    icon: '🎥', title: 'Webcam del navegador',
    description: 'Captura video directamente desde la cámara del dispositivo.',
    note: 'La captura es responsabilidad del navegador. El backend solo registra la sesión.',
  },
  grabacion_previa: {
    icon: '📁', title: 'Grabación previa',
    description: 'Usa un video subido anteriormente como fuente de análisis.',
  },
  camara_ip: {
    icon: '📷', title: 'Cámara IP',
    description: 'Stream en vivo desde una cámara IP registrada con RTSP.',
  },
};

type BufferedFrame = { t: number; detecciones: DetectionBox[] };

/** Devuelve las detecciones del último evento cuyo timestamp_video <= t (búsqueda binaria). */
function findDetectionsAt(buffer: BufferedFrame[], t: number): DetectionBox[] {
  let lo = 0, hi = buffer.length - 1, result: DetectionBox[] = [];
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (buffer[mid].t <= t) { result = buffer[mid].detecciones; lo = mid + 1; }
    else hi = mid - 1;
  }
  return result;
}

/** Dibuja zonas de exclusión (violeta, línea punteada) y bounding boxes de detecciones. */
function drawScene(
  canvas: HTMLCanvasElement,
  boxes: DetectionBox[],
  zones: ExclusionRect[],
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const w = canvas.width;
  const h = canvas.height;

  // Zonas de exclusión
  if (zones.length > 0) {
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#a855f7';
    ctx.fillStyle = '#a855f720';
    for (const z of zones) {
      ctx.fillRect(z.x * w, z.y * h, z.width * w, z.height * h);
      ctx.strokeRect(z.x * w, z.y * h, z.width * w, z.height * h);
    }
    ctx.restore();
  }

  // Bounding boxes — solo personas fuera de zonas de exclusión
  ctx.lineWidth = 2;
  ctx.font = 'bold 11px sans-serif';
  for (const b of boxes) {
    if (b.excluida) continue;
    ctx.strokeStyle = '#22d3ee';
    ctx.fillStyle = '#22d3ee33';
    const bx = b.x1 * w, by = b.y1 * h;
    const bw = (b.x2 - b.x1) * w, bh = (b.y2 - b.y1) * h;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = '#22d3ee';
    ctx.fillText(`${Math.round(b.conf * 100)}%`, bx + 2, by - 3);
  }
}

export default function MonitoreoPage() {
  // ── Carga de datos ───────────────────────────────────────────────────────
  const [sourcesData, setSourcesData] = useState<VideoSourcesResponse | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [zones, setZones] = useState<ExclusionZoneConfig[]>([]);

  // ── Subir grabación (fusionado desde la antigua página "Grabaciones") ────
  const [uploadingRecording, setUploadingRecording] = useState(false);
  const [recordingUploadError, setRecordingUploadError] = useState<string | null>(null);
  const [deletingRecordingId, setDeletingRecordingId] = useState<number | null>(null);
  const recordingFileInputRef = useRef<HTMLInputElement>(null);

  // ── Selección ────────────────────────────────────────────────────────────
  const [selectedType, setSelectedType] = useState<VideoSourceType | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<number | null>(null);
  const [selectedRecordingId, setSelectedRecordingId] = useState<number | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);

  // ── Flujo ────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('select');
  const [session, setSession] = useState<MonitoringSession | null>(null);

  // ── Análisis webcam ──────────────────────────────────────────────────────
  const [webcamActive, setWebcamActive] = useState(false);
  const [frameResult, setFrameResult] = useState<FrameAnalysisResult | null>(null);
  // RF-5.4: métricas de rendimiento
  const [latenciaMs, setLatenciaMs] = useState<number | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const fpsCounterRef = useRef(0);
  const fpsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasOverlayRef = useRef<HTMLCanvasElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const captureIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const capturingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  // Refs para evitar stale closures en setInterval/RAF
  const sessionRef = useRef<MonitoringSession | null>(null);
  const selectedZoneIdRef = useRef<number | null>(null);
  const currentZoneRectsRef = useRef<ExclusionRect[]>([]);
  const captureCallbackRef = useRef<() => Promise<void>>(async () => {});

  // ── Análisis cámara IP (MJPEG + SSE stats) ───────────────────────────────
  const [cameraStats, setCameraStats] = useState<{ personas: number; nivel: NivelAglomeracion; alerta: boolean } | null>(null);
  const cameraSseAbortRef = useRef<AbortController | null>(null);

  // ── Análisis video (SSE) ─────────────────────────────────────────────────
  const [videoAnalyzing, setVideoAnalyzing] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoCurrentStats, setVideoCurrentStats] = useState<VideoSSEEvent | null>(null);
  const [videoFin, setVideoFin] = useState<VideoSSEEvent | null>(null);
  const cancelVideoRef = useRef<(() => void) | null>(null);
  // Video player + canvas overlay para grabacion_previa
  const videoAnalysisRef = useRef<HTMLVideoElement>(null);
  const canvasVideoRef = useRef<HTMLCanvasElement>(null);
  const videoDetBufferRef = useRef<BufferedFrame[]>([]);
  const rafRef = useRef<number | null>(null);

  // ── UI ───────────────────────────────────────────────────────────────────
  const [loadingSources, setLoadingSources] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function flash(msg: string) { setSuccess(msg); setTimeout(() => setSuccess(null), 4000); }

  const loadData = useCallback(async () => {
    try {
      setLoadingSources(true);
      // Cada fetch aislado con su propio catch: una falla transitoria en una
      // (ej. /api/grabaciones) no debe tumbar a las demás (ej. cámaras IP),
      // o la UI muestra "no hay cámaras" aunque sí existan.
      const [data, recs, zoneList] = await Promise.all([
        getVideoSources().catch(() => null),
        getRecordings().catch(() => [] as Recording[]),
        getExclusionZones().catch(() => [] as ExclusionZoneConfig[]),
      ]);
      if (data) setSourcesData(data);
      else setError('No se pudieron cargar las fuentes de video. Intenta recargar.');
      setRecordings(recs);
      setZones(zoneList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar fuentes.');
    } finally {
      setLoadingSources(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const RECORDING_EXTS = ['.mp4', '.avi', '.mov', '.mkv'];

  async function handleUploadRecording(file: File) {
    const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
    if (!RECORDING_EXTS.includes(ext)) {
      setRecordingUploadError(`Formato no permitido. Usa: ${RECORDING_EXTS.join(', ')}`);
      return;
    }
    setRecordingUploadError(null);
    setUploadingRecording(true);
    try {
      const nueva = await uploadRecording(file);
      if (recordingFileInputRef.current) recordingFileInputRef.current.value = '';
      setRecordings(await getRecordings());
      setSelectedRecordingId(nueva.id);
      flash('Grabación subida correctamente.');
    } catch (e) {
      setRecordingUploadError(e instanceof Error ? e.message : 'Error al subir grabación.');
    } finally {
      setUploadingRecording(false);
    }
  }

  async function handleDeleteRecording(rec: Recording) {
    if (!confirm(`¿Eliminar la grabación "${rec.nombre_archivo}"? Esta acción no se puede deshacer.`)) return;
    setDeletingRecordingId(rec.id);
    try {
      await deleteRecording(rec.id);
      if (selectedRecordingId === rec.id) setSelectedRecordingId(null);
      setRecordings(await getRecordings());
      flash('Grabación eliminada.');
    } catch (e) {
      setRecordingUploadError(e instanceof Error ? e.message : 'Error al eliminar grabación.');
    } finally {
      setDeletingRecordingId(null);
    }
  }

  // ── Mantener refs sincronizados con el estado (evita stale closures) ────
  // Esto garantiza que el setInterval siempre use los valores más recientes.
  sessionRef.current = session;
  selectedZoneIdRef.current = selectedZoneId;
  currentZoneRectsRef.current = zones.find((z) => z.id === selectedZoneId)?.zonas ?? [];

  // ── captureAndSend como ref para que el interval use siempre la versión actual ──
  captureCallbackRef.current = async () => {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    const overlay = canvasOverlayRef.current;
    const currentSession = sessionRef.current;
    const currentZoneId = selectedZoneIdRef.current;
    const currentZoneRects = currentZoneRectsRef.current;
    // No lanzar una captura nueva si la anterior todavía no responde — si no,
    // con el backend más lento que el intervalo se amontonan peticiones en
    // vuelo que siguen llegando incluso después de pulsar "Detener".
    if (!video || !canvas || !currentSession || video.readyState < 2 || capturingRef.current) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    capturingRef.current = true;
    canvas.toBlob(async (blob) => {
      if (!blob) { capturingRef.current = false; return; }
      try {
        const t0 = Date.now();
        const result = await analyzeFrame(currentSession.id, blob, currentZoneId);
        setLatenciaMs(Date.now() - t0);
        fpsCounterRef.current++;
        setFrameResult(result);
        if (overlay && video) {
          overlay.width = video.clientWidth;
          overlay.height = video.clientHeight;
          drawScene(overlay, result.detecciones, currentZoneRects);
        }
      } catch {
        // ignorar errores de frame individual
      } finally {
        capturingRef.current = false;
      }
    }, 'image/jpeg', 0.85);
  };

  // ── SSE de stats de cámara IP ────────────────────────────────────────────
  function startCameraStatsSse(sesionId: number) {
    cameraSseAbortRef.current?.abort();
    const ctrl = new AbortController();
    cameraSseAbortRef.current = ctrl;
    const token = localStorage.getItem('token') ?? '';

    (async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/analisis/camara/${sesionId}/stream`,
          { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal },
        );
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            try {
              const ev = JSON.parse(line.slice(5).trim()) as { tipo: string; personas: number; nivel: NivelAglomeracion; alerta: boolean };
              if (ev.tipo === 'frame') {
                setCameraStats({ personas: ev.personas, nivel: ev.nivel, alerta: ev.alerta });
              }
            } catch { /* ignorar líneas mal formadas */ }
          }
        }
      } catch { /* abortado o desconectado */ }
    })();
  }

  function stopCameraSse() {
    cameraSseAbortRef.current?.abort();
    cameraSseAbortRef.current = null;
  }

  // ── Cleanup al desmontar ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopWebcam();
      cancelVideoRef.current?.();
      stopVideoRAF();
      stopCameraSse();
    };
  }, []);

  // ── Dibujar zonas en canvas webcam cuando la cámara arranca ─────────────
  useEffect(() => {
    if (!webcamActive) return;
    const video = videoRef.current;
    const canvas = canvasOverlayRef.current;
    if (!video || !canvas) return;

    function onPlay() {
      if (!canvas || !video) return;
      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;
      drawScene(canvas, [], selectedZone?.zonas ?? []);
    }
    video.addEventListener('play', onPlay);
    // También dibujar si ya está reproduciendo
    if (!video.paused) onPlay();
    return () => video.removeEventListener('play', onPlay);
  }, [webcamActive, selectedZoneId, zones]);

  // ── Webcam helpers ───────────────────────────────────────────────────────
  async function startWebcam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setWebcamActive(true);
      beginCapture();
    } catch {
      setError('No se pudo acceder a la cámara. Verifica los permisos del navegador.');
    }
  }

  function stopWebcam() {
    if (captureIntervalRef.current) { clearInterval(captureIntervalRef.current); captureIntervalRef.current = null; }
    if (fpsTimerRef.current) { clearInterval(fpsTimerRef.current); fpsTimerRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    fpsCounterRef.current = 0;
    capturingRef.current = false;
    setWebcamActive(false);
    setFps(null);
    setLatenciaMs(null);
  }

  function beginCapture() {
    if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
    if (fpsTimerRef.current) clearInterval(fpsTimerRef.current);
    fpsCounterRef.current = 0;
    // Usa el ref para que siempre llame a la versión más reciente del callback
    captureIntervalRef.current = setInterval(() => { void captureCallbackRef.current?.(); }, 100);
    // Actualiza FPS cada segundo contando frames respondidos
    fpsTimerRef.current = setInterval(() => {
      setFps(fpsCounterRef.current);
      fpsCounterRef.current = 0;
    }, 1000);
  }

  // ── RAF loop para canvas sobre video de análisis ─────────────────────────
  function startVideoRAF() {
    function tick() {
      const c = canvasVideoRef.current;
      const v = videoAnalysisRef.current;
      if (c && v && v.videoWidth > 0 && v.videoHeight > 0) {
        // El <video> usa object-contain: si el aspect ratio del video no
        // coincide con el del contenedor, queda con barras negras (letterbox).
        // El canvas debe ocupar solo el área real donde se ve el video,
        // si no, los bounding boxes quedan desalineados de la gente.
        const elW = v.clientWidth;
        const elH = v.clientHeight;
        const elRatio = elW / elH;
        const videoRatio = v.videoWidth / v.videoHeight;

        let renderW: number, renderH: number, offsetX: number, offsetY: number;
        if (videoRatio > elRatio) {
          renderW = elW;
          renderH = elW / videoRatio;
          offsetX = 0;
          offsetY = (elH - renderH) / 2;
        } else {
          renderH = elH;
          renderW = elH * videoRatio;
          offsetY = 0;
          offsetX = (elW - renderW) / 2;
        }

        if (c.width !== renderW) c.width = renderW;
        if (c.height !== renderH) c.height = renderH;
        c.style.left = `${offsetX}px`;
        c.style.top = `${offsetY}px`;
        c.style.width = `${renderW}px`;
        c.style.height = `${renderH}px`;

        // Usa el ref de zonas para tener siempre el valor actual
        const detecciones = findDetectionsAt(videoDetBufferRef.current, v.currentTime);
        drawScene(c, detecciones, currentZoneRectsRef.current);
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  function stopVideoRAF() {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  // ── Handlers de flujo ────────────────────────────────────────────────────
  function handleSelectType(tipo: VideoSourceType) {
    setSelectedType(tipo);
    setSelectedCameraId(null);
    setSelectedRecordingId(null);
    setStep('select');
    setError(null);
  }

  async function handleConfirm() {
    if (!selectedType) return;
    if (selectedType === 'camara_ip' && !selectedCameraId) { setError('Selecciona una cámara IP.'); return; }
    setConfirming(true);
    setError(null);
    try {
      await selectVideoSource({
        tipo: selectedType,
        ...(selectedCameraId != null ? { camara_id: selectedCameraId } : {}),
        ...(selectedRecordingId != null ? { grabacion_id: selectedRecordingId } : {}),
      });
      setStep('confirmed');
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al confirmar fuente.'); }
    finally { setConfirming(false); }
  }

  async function handleStart() {
    if (!selectedType) return;
    setStarting(true);
    setError(null);
    try {
      const s = await startMonitoring({
        tipo_fuente: selectedType,
        ...(selectedCameraId != null ? { camara_id: selectedCameraId } : {}),
        ...(selectedRecordingId != null ? { grabacion_id: selectedRecordingId } : {}),
        ...(selectedZoneId != null ? { zona_exclusion_id: selectedZoneId } : {}),
      });
      setSession(s);
      setStep('active');
      flash('Monitoreo iniciado.');

      if (selectedType === 'webcam') {
        await startWebcam();
      } else if (selectedType === 'camara_ip') {
        startCameraStatsSse(s.id);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al iniciar monitoreo.'); }
    finally { setStarting(false); }
  }

  async function handleStop() {
    if (!session) return;
    setStopping(true);
    setError(null);
    stopWebcam();
    cancelVideoRef.current?.();
    stopVideoRAF();
    stopCameraSse();
    setVideoAnalyzing(false);
    try {
      const s = await stopMonitoring(session.id);
      setSession(s);
      setStep('stopped');
      flash('Monitoreo detenido.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al detener monitoreo.'); }
    finally { setStopping(false); }
  }

  function handleReset() {
    setSelectedType(null); setSelectedCameraId(null); setSelectedRecordingId(null);
    setSelectedZoneId(null); setSession(null); setStep('select'); setError(null);
    setFrameResult(null); setVideoProgress(0); setVideoCurrentStats(null); setVideoFin(null);
    setFps(null); setLatenciaMs(null); setCameraStats(null);
    videoDetBufferRef.current = [];
    stopCameraSse();
  }

  // ── SSE análisis de video ─────────────────────────────────────────────────
  function handleStartVideoAnalysis() {
    if (!session) return;
    setVideoAnalyzing(true);
    setVideoProgress(0);
    setVideoCurrentStats(null);
    setVideoFin(null);
    videoDetBufferRef.current = [];

    // Arrancar el video en el player y el RAF para las cajas
    if (videoAnalysisRef.current && selectedRecordingId != null) {
      const token = localStorage.getItem('token') ?? '';
      videoAnalysisRef.current.src = `${API_URL}/api/grabaciones/${selectedRecordingId}/file?token=${encodeURIComponent(token)}`;
      videoAnalysisRef.current.play().catch(() => null);
      startVideoRAF();
    }

    const cancel = streamVideoAnalisis(
      session.id,
      (ev) => {
        if (ev.tipo === 'frame') {
          setVideoProgress(ev.progreso ?? 0);
          setVideoCurrentStats(ev);
          // Encolar las detecciones con su timestamp para que el RAF las
          // sincronice con currentTime — el análisis SSE corre más rápido
          // que la reproducción real, no se puede usar solo "la última".
          videoDetBufferRef.current.push({ t: ev.timestamp_video ?? 0, detecciones: ev.detecciones ?? [] });
        }
        if (ev.tipo === 'fin') {
          setVideoFin(ev);
          setVideoAnalyzing(false);
          cancelVideoRef.current = null;
          // No se detiene el RAF aquí: el <video> puede seguir reproduciéndose
          // más tiempo real que lo que tardó el análisis SSE en terminar.
          // El RAF se detiene con el evento nativo 'ended' del <video>.
        }
        if (ev.tipo === 'error') {
          setError(ev.mensaje ?? 'Error en el análisis.');
          setVideoAnalyzing(false);
          stopVideoRAF();
        }
      },
      () => { setVideoAnalyzing(false); },
      (msg) => { setError(msg); setVideoAnalyzing(false); stopVideoRAF(); },
    );
    cancelVideoRef.current = cancel;
  }

  // ── Valores derivados ────────────────────────────────────────────────────
  const activeCameras = sourcesData?.camaras_ip.filter((c) => c.activa) ?? [];
  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null;
  const nivel = frameResult?.nivel ?? 'sin_aglomeracion';
  const nivelStyle = NIVEL_STYLE[nivel];

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════

  return (
    <div className="max-w-3xl mx-auto">
      {/* Hidden canvases */}
      <canvas ref={captureCanvasRef} className="hidden" />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0F172A]">Monitoreo</h1>
      </div>

      {success && <div className="mb-4 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">{success}</div>}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex justify-between items-start">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-4 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* ── SESIÓN ACTIVA / DETENIDA ──────────────────────────────────────── */}
      {session && (step === 'active' || step === 'stopped') && (
        <div className="mb-4">
          {/* Header sesión */}
          <div className={`rounded-xl border px-5 py-4 flex items-center justify-between gap-4 mb-4 ${step === 'active' ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
            <div>
              <p className="font-semibold text-[#0F172A] text-sm">
                {step === 'active' ? '🟢' : '⚪'} Sesión #{session.id} — {step === 'active' ? 'En curso' : 'Detenida'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{SOURCE_INFO[session.tipo_fuente].title}</p>
              {selectedZone && <p className="text-xs text-violet-600 mt-0.5 font-medium">Zona: {selectedZone.nombre}</p>}
            </div>
            <div className="flex gap-2">
              {step === 'active' && (
                <button onClick={handleStop} disabled={stopping}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-60">
                  {stopping ? 'Deteniendo…' : 'Detener'}
                </button>
              )}
              {step === 'stopped' && (
                <button onClick={handleReset}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">
                  Nueva sesión
                </button>
              )}
            </div>
          </div>

          {/* ── WEBCAM: video + overlay ─────────────────────────────────── */}
          {session.tipo_fuente === 'webcam' && step === 'active' && (
            <div className="flex flex-col gap-4">
              <div className="relative rounded-xl bg-slate-950 border border-slate-700 overflow-hidden aspect-video">
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                <canvas
                  ref={canvasOverlayRef}
                  className="absolute inset-0 w-full h-full"
                  style={{ pointerEvents: 'none' }}
                />
                {!webcamActive && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-slate-400 text-sm">Iniciando cámara…</p>
                  </div>
                )}
              </div>

              {frameResult && (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard label="Grupo más grande" value={String(frameResult.personas)} accent="blue" />
                    <div className={`rounded-xl px-4 py-3 border ${nivelStyle.bg} ${nivelStyle.border}`}>
                      <p className="text-[10px] uppercase tracking-wide opacity-60 mb-0.5">Nivel</p>
                      <p className={`text-sm font-bold ${nivelStyle.text}`}>{nivelStyle.label}</p>
                    </div>
                    <StatCard label="Máx. sesión" value={String(frameResult.personas_maximas)} accent="slate" />
                    <div className={`rounded-xl px-4 py-3 border ${frameResult.alerta_activada ? 'bg-red-100 border-red-300' : 'bg-slate-50 border-slate-200'}`}>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Alerta</p>
                      <p className={`text-sm font-bold ${frameResult.alerta_activada ? 'text-red-700' : 'text-slate-400'}`}>
                        {frameResult.alerta_activada ? '⚠ ACTIVA' : 'Sin alerta'}
                      </p>
                    </div>
                  </div>

                  {/* RF-5.4 — Métricas de rendimiento */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl px-4 py-3 border border-slate-200 bg-slate-50">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">FPS analizados</p>
                      <p className="text-sm font-bold text-[#0F172A]">
                        {fps != null ? `${fps} fps` : '—'}
                      </p>
                    </div>
                    <div className={`rounded-xl px-4 py-3 border ${
                      latenciaMs != null && latenciaMs > 800
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Latencia backend</p>
                      <p className={`text-sm font-bold ${latenciaMs != null && latenciaMs > 800 ? 'text-amber-700' : 'text-[#0F172A]'}`}>
                        {latenciaMs != null ? `${latenciaMs} ms` : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm border-2 border-cyan-400 inline-block" />
                  Persona detectada
                </span>
                {selectedZone && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm border-2 border-dashed border-purple-500 inline-block" />
                    Zona de exclusión (ignorada)
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── GRABACIÓN PREVIA: análisis SSE + video player ────────────── */}
          {session.tipo_fuente === 'grabacion_previa' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col gap-0">

              {/* Video player (siempre visible si hay grabación seleccionada) */}
              {selectedRecordingId != null && (
                <div className="relative bg-slate-950 aspect-video">
                  <video
                    ref={videoAnalysisRef}
                    className="w-full h-full object-contain"
                    muted
                    playsInline
                    controls={!videoAnalyzing}
                    onEnded={() => stopVideoRAF()}
                  />
                  <canvas
                    ref={canvasVideoRef}
                    className="absolute inset-0 w-full h-full"
                    style={{ pointerEvents: 'none' }}
                  />
                  {!videoAnalyzing && !videoFin && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <p className="text-slate-400 text-xs bg-black/50 px-3 py-1 rounded-full">
                        El video se reproducirá al iniciar el análisis
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="p-5 flex flex-col gap-4">
                {!videoAnalyzing && !videoFin && (
                  <div className="text-center py-2">
                    {selectedRecordingId == null && (
                      <>
                        <p className="text-4xl mb-3" aria-hidden="true">🎞</p>
                        <p className="text-sm font-medium text-[#0F172A] mb-1">Sin grabación seleccionada</p>
                        <p className="text-xs text-slate-400 mb-4">
                          La sesión se inició sin grabación. El análisis procesará frames vacíos.
                        </p>
                      </>
                    )}
                    {selectedRecordingId != null && (
                      <p className="text-xs text-slate-400 mb-3">
                        El sistema procesará el video frame a frame con YOLOv8 y BFS.
                      </p>
                    )}
                    <button
                      onClick={handleStartVideoAnalysis}
                      disabled={step !== 'active'}
                      className="px-5 py-2.5 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                      ▶ Iniciar análisis
                    </button>
                  </div>
                )}

                {videoAnalyzing && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Procesando con YOLOv8…</span>
                      <span>{videoProgress.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div
                        className="bg-[#2563EB] h-2 rounded-full transition-all duration-300"
                        style={{ width: `${videoProgress}%` }}
                      />
                    </div>

                    {videoCurrentStats && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <StatCard label="Grupo detectado" value={String(videoCurrentStats.personas ?? 0)} accent="blue" />
                        <div className={`rounded-xl px-4 py-3 border ${NIVEL_STYLE[videoCurrentStats.nivel ?? 'sin_aglomeracion'].bg} ${NIVEL_STYLE[videoCurrentStats.nivel ?? 'sin_aglomeracion'].border}`}>
                          <p className="text-[10px] uppercase tracking-wide opacity-60 mb-0.5">Nivel</p>
                          <p className={`text-sm font-bold ${NIVEL_STYLE[videoCurrentStats.nivel ?? 'sin_aglomeracion'].text}`}>
                            {NIVEL_STYLE[videoCurrentStats.nivel ?? 'sin_aglomeracion'].label}
                          </p>
                        </div>
                        <StatCard
                          label="Tiempo en video"
                          value={videoCurrentStats.timestamp_video != null
                            ? `${videoCurrentStats.timestamp_video.toFixed(1)}s`
                            : '—'}
                          accent="slate"
                        />
                      </div>
                    )}

                    <button onClick={() => { cancelVideoRef.current?.(); setVideoAnalyzing(false); stopVideoRAF(); }}
                      className="self-start text-xs text-slate-400 hover:text-red-500 transition-colors">
                      Cancelar
                    </button>
                  </div>
                )}

                {videoFin && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg" aria-hidden="true">✅</span>
                      <p className="font-semibold text-[#0F172A] text-sm">Análisis completado</p>
                      {videoFin.alerta_activada && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-600 text-white">⚠ ALERTA ACTIVADA</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <StatCard label="Grupo máx." value={String(videoFin.personas_maximas ?? 0)} accent="blue" />
                      <div className={`rounded-xl px-4 py-3 border ${NIVEL_STYLE[videoFin.nivel_maximo ?? 'sin_aglomeracion'].bg} ${NIVEL_STYLE[videoFin.nivel_maximo ?? 'sin_aglomeracion'].border}`}>
                        <p className="text-[10px] uppercase tracking-wide opacity-60 mb-0.5">Nivel máx.</p>
                        <p className={`text-sm font-bold ${NIVEL_STYLE[videoFin.nivel_maximo ?? 'sin_aglomeracion'].text}`}>
                          {NIVEL_STYLE[videoFin.nivel_maximo ?? 'sin_aglomeracion'].label}
                        </p>
                      </div>
                      <StatCard
                        label="Primera det. media"
                        value={videoFin.tiempo_primera_media_seg != null
                          ? `${videoFin.tiempo_primera_media_seg.toFixed(1)}s`
                          : '—'}
                        accent="amber"
                      />
                      <StatCard label="Frames analizados" value={String(videoFin.frames_procesados ?? 0)} accent="slate" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── CÁMARA IP: stream MJPEG en vivo ──────────────────────────── */}
          {session.tipo_fuente === 'camara_ip' && step === 'active' && (
            <div className="flex flex-col gap-4">
              <div className="relative rounded-xl bg-slate-950 border border-slate-700 overflow-hidden aspect-video">
                <img
                  src={`${API_URL}/api/analisis/camara/${session.id}/mjpeg?token=${encodeURIComponent(localStorage.getItem('token') ?? '')}`}
                  alt="Stream cámara IP"
                  className="w-full h-full object-contain"
                  onError={() => setError('No se pudo conectar al stream RTSP. Verifica la cámara y las credenciales.')}
                />
                <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/60 text-[10px] font-bold text-red-400 uppercase tracking-wide">
                  LIVE
                </div>
              </div>

              {cameraStats && (() => {
                const ns = NIVEL_STYLE[cameraStats.nivel];
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <StatCard label="Grupo más grande" value={String(cameraStats.personas)} accent="blue" />
                    <div className={`rounded-xl px-4 py-3 border ${ns.bg} ${ns.border}`}>
                      <p className="text-[10px] uppercase tracking-wide opacity-60 mb-0.5">Nivel</p>
                      <p className={`text-sm font-bold ${ns.text}`}>{ns.label}</p>
                    </div>
                    <div className={`rounded-xl px-4 py-3 border ${cameraStats.alerta ? 'bg-red-100 border-red-300' : 'bg-slate-50 border-slate-200'}`}>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Alerta</p>
                      <p className={`text-sm font-bold ${cameraStats.alerta ? 'text-red-700' : 'text-slate-400'}`}>
                        {cameraStats.alerta ? '⚠ ACTIVA' : 'Sin alerta'}
                      </p>
                    </div>
                  </div>
                );
              })()}

              <div className="flex flex-wrap gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm border-2 border-cyan-400 inline-block" />
                  Persona detectada
                </span>
                {selectedZone && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm border-2 border-dashed border-purple-500 inline-block" />
                    Zona de exclusión (ignorada)
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SELECTOR DE FUENTE ────────────────────────────────────────────── */}
      {step !== 'active' && step !== 'stopped' && (
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-4">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-[#0F172A] text-base">Seleccionar fuente de video</h2>
            </div>
            <div className="p-6">
              {loadingSources ? (
                <p className="text-slate-400 text-sm text-center py-4">Cargando fuentes…</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(Object.keys(SOURCE_INFO) as VideoSourceType[]).map((tipo) => {
                    const info = SOURCE_INFO[tipo];
                    const active = selectedType === tipo;
                    return (
                      <button
                        key={tipo}
                        onClick={() => handleSelectType(tipo)}
                        className={`text-left p-4 rounded-xl border-2 transition-all ${
                          active
                            ? 'border-[#2563EB] bg-blue-50'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <span className="text-2xl mb-2 block" aria-hidden="true">{info.icon}</span>
                        <p className={`text-sm font-semibold mb-1 ${active ? 'text-[#2563EB]' : 'text-[#0F172A]'}`}>
                          {info.title}
                        </p>
                        <p className="text-xs text-slate-500 leading-relaxed">{info.description}</p>
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedType === 'camara_ip' && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-2">
                    Cámara activa <span className="text-red-500">*</span>
                  </label>
                  {activeCameras.length === 0
                    ? <p className="text-sm text-slate-400 italic">No hay cámaras activas.</p>
                    : <select value={selectedCameraId ?? ''} onChange={(e) => setSelectedCameraId(Number(e.target.value) || null)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Selecciona una cámara…</option>
                        {activeCameras.map((c) => <option key={c.id} value={c.id}>{c.nombre} — {c.ubicacion}</option>)}
                      </select>}
                </div>
              )}

              {selectedType === 'grabacion_previa' && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-2">
                    Grabación
                  </label>
                  {recordings.length === 0
                    ? <p className="text-sm text-slate-400 italic mb-3">No hay grabaciones todavía — sube una abajo.</p>
                    : (
                      <div className="flex gap-2 mb-3">
                        <select value={selectedRecordingId ?? ''} onChange={(e) => setSelectedRecordingId(Number(e.target.value) || null)}
                          className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="">Selecciona una grabación…</option>
                          {recordings.map((r) => <option key={r.id} value={r.id}>{r.nombre_archivo}</option>)}
                        </select>
                        {selectedRecordingId != null && (
                          <button
                            type="button"
                            onClick={() => {
                              const rec = recordings.find((r) => r.id === selectedRecordingId);
                              if (rec) void handleDeleteRecording(rec);
                            }}
                            disabled={deletingRecordingId === selectedRecordingId}
                            className="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            {deletingRecordingId === selectedRecordingId ? '…' : 'Eliminar'}
                          </button>
                        )}
                      </div>
                    )}

                  {/* Subir un video nuevo, sin salir de Monitoreo */}
                  <input
                    ref={recordingFileInputRef}
                    type="file"
                    accept={RECORDING_EXTS.join(',')}
                    className="hidden"
                    id="monitoreo-recording-upload"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleUploadRecording(file);
                    }}
                  />
                  <label
                    htmlFor="monitoreo-recording-upload"
                    className={`inline-block cursor-pointer px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors ${uploadingRecording ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    {uploadingRecording ? 'Subiendo…' : '+ Subir video nuevo'}
                  </label>
                  <span className="ml-2 text-[10px] text-slate-400">
                    Formatos: {RECORDING_EXTS.join(', ')}
                  </span>
                  {recordingUploadError && (
                    <p className="mt-2 text-xs text-red-600">{recordingUploadError}</p>
                  )}
                </div>
              )}
            </div>

            {selectedType && (
              <div className="px-6 py-4 border-t border-slate-100">
                <button onClick={handleConfirm} disabled={confirming}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold transition-colors disabled:opacity-60">
                  {confirming ? 'Confirmando…' : 'Confirmar selección'}
                </button>
              </div>
            )}
          </div>

          {step === 'confirmed' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="font-semibold text-[#0F172A] text-sm">
                      Zona de exclusión
                      <span className="ml-2 text-[10px] font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">opcional</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">Áreas que el sistema ignorará durante el análisis.</p>
                  </div>
                  {selectedZone && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200 shrink-0">
                      {selectedZone.zonas.length} zona{selectedZone.zonas.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {zones.length === 0
                  ? <p className="text-xs text-slate-400 italic">No hay configuraciones de zonas.</p>
                  : <select value={selectedZoneId ?? ''} onChange={(e) => setSelectedZoneId(Number(e.target.value) || null)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
                      <option value="">Sin zona de exclusión</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.nombre} — umbral alto: {z.umbral_alto} pers.
                        </option>
                      ))}
                    </select>}

                {selectedZone && (
                  <div className="mt-3 rounded-lg overflow-hidden border border-violet-200 bg-slate-950 h-24">
                    <img
                      src={`${API_URL}/${selectedZone.frame_referencia.replace(/\\/g, '/')}`}
                      alt={selectedZone.nombre}
                      className="h-full w-full object-cover opacity-80"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
                <p className="text-[10px] text-amber-600 mt-2 font-medium">
                  ⚠ Las zonas se aplican durante el análisis YOLO.
                </p>
              </div>

              <div className="px-6 py-4 bg-slate-50 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-semibold text-[#0F172A] text-sm">
                    Fuente: {selectedType ? SOURCE_INFO[selectedType].title : ''}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">Presiona "Iniciar" para registrar la sesión.</p>
                </div>
                <button onClick={handleStart} disabled={starting}
                  className="shrink-0 px-5 py-2.5 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-60">
                  {starting ? 'Iniciando…' : '▶ Iniciar monitoreo'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200',
    amber: 'bg-amber-50 border-amber-200',
    slate: 'bg-slate-50 border-slate-200',
  };
  return (
    <div className={`rounded-xl px-4 py-3 border ${colors[accent] ?? colors.slate}`}>
      <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm font-bold text-[#0F172A]">{value}</p>
    </div>
  );
}
