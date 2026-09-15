import { useState, useEffect, useRef, useCallback } from 'react';
import type { CameraIP, NivelAglomeracion } from '../../types/api';
import { getCameras } from '../../services/cameraService';
import { startMonitoring } from '../../services/monitoringService';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 3000;
const MAX_DELAY_MS = 30_000;

type TileStatus = 'starting' | 'live' | 'reconnecting' | 'failed';

const NIVEL_STYLE: Record<NivelAglomeracion, { bg: string; text: string; border: string; label: string }> = {
  sin_aglomeracion: { bg: 'bg-slate-700/50', text: 'text-slate-300', border: 'border-slate-600', label: 'Sin aglomeración' },
  bajo:              { bg: 'bg-green-500/20', text: 'text-green-300', border: 'border-green-500/40', label: 'Bajo' },
  medio:             { bg: 'bg-amber-500/20', text: 'text-amber-300', border: 'border-amber-500/40', label: 'Medio' },
  alto:              { bg: 'bg-red-500/20',   text: 'text-red-300',   border: 'border-red-500/40',   label: 'Alto' },
};

export default function MulticamaraPage() {
  const [cameras, setCameras] = useState<CameraIP[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<number[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await getCameras();
        setCameras(data.filter((c) => c.activa));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar cámaras.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const visibleCameras = cameras.filter((c) => !hiddenIds.includes(c.id));
  const hiddenCameras = cameras.filter((c) => hiddenIds.includes(c.id));

  function hideCamera(id: number) {
    setHiddenIds((ids) => [...ids, id]);
  }
  function showCamera(id: number) {
    setHiddenIds((ids) => ids.filter((x) => x !== id));
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0F172A]">Vista multi-cámara</h1>
        <p className="text-slate-500 text-sm mt-1">Monitoreo simultáneo de cámaras IP en vivo</p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-slate-400 text-sm">Cargando cámaras...</p>
        </div>
      ) : cameras.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-3xl mb-3">📷</p>
          <p className="font-medium text-slate-600 text-sm">No hay cámaras activas registradas.</p>
          <p className="text-slate-400 text-xs mt-1">Registra y activa cámaras en "Cámaras IP".</p>
        </div>
      ) : (
        <>
          {hiddenCameras.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2 items-center">
              <span className="text-xs text-slate-400">Ocultas:</span>
              {hiddenCameras.map((c) => (
                <button
                  key={c.id}
                  onClick={() => showCamera(c.id)}
                  className="text-xs px-3 py-1 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  + {c.nombre}
                </button>
              ))}
            </div>
          )}

          {visibleCameras.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <p className="text-slate-400 text-sm">Todas las cámaras están ocultas.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {visibleCameras.map((c) => (
                <CameraTile key={c.id} camera={c} onHide={() => hideCamera(c.id)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CameraTile({ camera, onHide }: { camera: CameraIP; onHide: () => void }) {
  const [status, setStatus] = useState<TileStatus>('starting');
  const [attempt, setAttempt] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [stats, setStats] = useState<{ personas: number; nivel: NivelAglomeracion; alerta: boolean } | null>(null);

  const sessionIdRef = useRef<number | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const clearTimers = useCallback(() => {
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; }
  }, []);

  // Devuelve la promesa del inicio de sesión (no solo dispara el side-effect):
  // el cleanup del efecto de montaje la captura por closure para poder
  // detener la sesión correcta aunque el cleanup corra ANTES de que la
  // petición resuelva (pasa con React StrictMode, que monta/desmonta cada
  // componente dos veces en desarrollo). Si solo lee sessionIdRef.current en
  // ese momento, todavía está en null y la sesión vieja nunca se cierra —
  // el backend igual la cierra por su cuenta (nunca hay 2 hilos vivos para
  // la misma cámara), pero el navegador se queda apuntando al id viejo, ya
  // cerrado, y sale un 409 al pedir el stream.
  const connectSession = useCallback(() => {
    setStatus('starting');
    return startMonitoring({
      tipo_fuente: 'camara_ip',
      camara_id: camera.id,
      // Multicámara no tiene selector de zona por sesión: usa la zona por
      // defecto configurada en la cámara (el backend también hace este
      // fallback si se omite, pero se manda explícito para que quede claro).
      ...(camera.zona_exclusion_id != null ? { zona_exclusion_id: camera.zona_exclusion_id } : {}),
    })
      .then((s) => {
        if (mountedRef.current) {
          sessionIdRef.current = s.id;
          setRetryKey((k) => k + 1);
        }
        return s;
      })
      .catch(() => {
        if (mountedRef.current) setStatus('failed');
        return null;
      });
  }, [camera.id]);

  // Iniciar sesión de monitoreo al montar. Al desmontar/ocultar NO se
  // detiene la sesión: una sesión de cámara IP es compartida (puede haber
  // varios usuarios viéndola a la vez — admin y vigilantes), así que salir
  // de esta vista solo debe cerrar la conexión de ESTE navegador, no apagar
  // la cámara para los demás. El backend limpia sesiones huérfanas solo al
  // reiniciar (ver app/main.py), y "Monitoreo" (una sola cámara) sigue
  // teniendo su propio botón explícito de "Detener" para cuando de verdad
  // se quiere terminar el monitoreo y guardar el resultado.
  useEffect(() => {
    mountedRef.current = true;
    connectSession();
    return () => {
      mountedRef.current = false;
      clearTimers();
      sseAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectSession, clearTimers]);

  // SSE de stats — se reabre cada vez que se (re)conecta el stream.
  useEffect(() => {
    const sessionId = sessionIdRef.current;
    if (sessionId == null) return;
    sseAbortRef.current?.abort();
    const ctrl = new AbortController();
    sseAbortRef.current = ctrl;
    const token = localStorage.getItem('token') ?? '';

    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/analisis/camara/${sessionId}/stream`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: ctrl.signal,
        });
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
              if (ev.tipo === 'frame') setStats({ personas: ev.personas, nivel: ev.nivel, alerta: ev.alerta });
            } catch { /* ignorar líneas mal formadas */ }
          }
        }
      } catch { /* abortado o desconectado */ }
    })();

    return () => ctrl.abort();
  }, [retryKey]);

  function scheduleRetry() {
    setStats(null);
    setAttempt((prevAttempt) => {
      const next = prevAttempt + 1;
      if (next > MAX_RETRIES) {
        setStatus('failed');
        return prevAttempt;
      }
      setStatus('reconnecting');
      const delay = Math.min(BASE_DELAY_MS * 2 ** (next - 1), MAX_DELAY_MS);
      let remaining = Math.ceil(delay / 1000);
      setCountdown(remaining);
      clearTimers();
      countdownTimerRef.current = setInterval(() => {
        remaining -= 1;
        if (mountedRef.current) setCountdown(remaining > 0 ? remaining : 0);
      }, 1000);
      retryTimerRef.current = setTimeout(() => {
        clearTimers();
        if (!mountedRef.current) return;
        setStatus('starting');
        setRetryKey((k) => k + 1);
      }, delay);
      return next;
    });
  }

  function handleManualRetry() {
    clearTimers();
    setAttempt(0);
    setCountdown(null);
    if (sessionIdRef.current == null) {
      connectSession();
    } else {
      setStatus('starting');
      setRetryKey((k) => k + 1);
    }
  }

  function handleImgLoad() {
    setStatus('live');
    setAttempt(0);
  }

  function handleImgError() {
    if (status === 'failed') return;
    scheduleRetry();
  }

  const sessionId = sessionIdRef.current;
  const token = localStorage.getItem('token') ?? '';
  const showImg = sessionId != null && (status === 'starting' || status === 'live');

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden flex flex-col">
      <div className="px-3 py-2 flex items-center justify-between gap-2 bg-slate-800/80">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{camera.nombre}</p>
          <p className="text-[10px] text-slate-400 truncate">{camera.ubicacion}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusPill status={status} />
          <button
            onClick={onHide}
            title="Ocultar cámara"
            className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-slate-700 transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="relative aspect-video bg-black">
        {showImg && (
          <img
            key={retryKey}
            src={`${API_URL}/api/analisis/camara/${sessionId}/mjpeg?token=${encodeURIComponent(token)}&r=${retryKey}`}
            alt={camera.nombre}
            className="w-full h-full object-contain"
            onLoad={handleImgLoad}
            onError={handleImgError}
          />
        )}

        {status === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-slate-400 text-xs">Conectando…</p>
          </div>
        )}

        {status === 'reconnecting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70">
            <p className="text-amber-400 text-xs font-medium">Reconectando… (intento {attempt}/{MAX_RETRIES})</p>
            {countdown != null && countdown > 0 && (
              <p className="text-slate-400 text-[11px]">Próximo intento en {countdown}s</p>
            )}
          </div>
        )}

        {status === 'failed' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-4 text-center">
            <p className="text-2xl" aria-hidden="true">📷</p>
            <p className="text-red-400 text-xs font-medium">No se pudo conectar al stream RTSP.</p>
            <p className="text-slate-500 text-[11px]">Verifica la cámara y las credenciales.</p>
            <button
              onClick={handleManualRetry}
              className="mt-1 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
            >
              Reintentar
            </button>
          </div>
        )}
      </div>

      <div className="px-3 py-2 min-h-[34px] flex items-center gap-2 text-[11px]">
        {stats && status === 'live' && (() => {
          const ns = NIVEL_STYLE[stats.nivel];
          return (
            <>
              <span className="text-slate-300">Grupo: <b className="text-white">{stats.personas}</b></span>
              <span className={`px-2 py-0.5 rounded-full border ${ns.bg} ${ns.text} ${ns.border}`}>{ns.label}</span>
              {stats.alerta && (
                <span className="px-2 py-0.5 rounded-full bg-red-600 text-white font-bold">⚠ ALERTA</span>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: TileStatus }) {
  const map: Record<TileStatus, { label: string; cls: string }> = {
    starting:     { label: 'Conectando', cls: 'bg-slate-600/60 text-slate-300' },
    live:         { label: '● LIVE', cls: 'bg-red-500/20 text-red-400' },
    reconnecting: { label: 'Reconectando', cls: 'bg-amber-500/20 text-amber-300' },
    failed:       { label: 'Sin conexión', cls: 'bg-slate-700 text-slate-400' },
  };
  const s = map[status];
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>;
}
