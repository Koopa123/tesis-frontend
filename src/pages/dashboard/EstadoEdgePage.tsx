import { useState, useEffect, useCallback } from 'react';
import type { EstadoCamaraEdge, NivelAglomeracion } from '../../types/api';
import { getEstadoCamaras, getEvidenciaCamara } from '../../services/edgeService';

const NIVEL_LABELS: Record<NivelAglomeracion, string> = {
  sin_aglomeracion: 'Sin aglomeración',
  bajo: 'Bajo',
  medio: 'Medio',
  alto: 'Alto',
};

const NIVEL_COLORS: Record<NivelAglomeracion, string> = {
  sin_aglomeracion: 'bg-slate-100 text-slate-600 border-slate-200',
  bajo: 'bg-green-100 text-green-700 border-green-200',
  medio: 'bg-amber-100 text-amber-700 border-amber-200',
  alto: 'bg-red-100 text-red-700 border-red-200',
};

// Se refresca solo (polling), no por SSE: es el "último estado conocido"
// reportado por la laptop del local, no un stream continuo.
const REFRESH_MS = 8000;

function formatDate(s: string | null): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'medium' });
  } catch { return s; }
}

function haceCuanto(s: string | null): string {
  if (!s) return '';
  const segs = Math.round((Date.now() - new Date(s).getTime()) / 1000);
  if (segs < 0) return '';
  if (segs < 60) return `hace ${segs}s`;
  if (segs < 3600) return `hace ${Math.round(segs / 60)} min`;
  return `hace ${Math.round(segs / 3600)} h`;
}

export default function EstadoEdgePage() {
  const [camaras, setCamaras] = useState<EstadoCamaraEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evidencia, setEvidencia] = useState<{ id: number; src: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setCamaras(await getEstadoCamaras());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el estado de las cámaras.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => { void load(); }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  async function verEvidencia(camaraId: number) {
    try {
      const r = await getEvidenciaCamara(camaraId);
      setEvidencia({ id: camaraId, src: `data:image/jpeg;base64,${r.frame_evidencia_b64}` });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la evidencia.');
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0F172A]">Estado en vivo (local)</h1>
        <p className="text-slate-500 text-sm mt-1">
          Última lectura reportada por la laptop del establecimiento — no es video en vivo,
          se actualiza sola cada {REFRESH_MS / 1000}s.
        </p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-4 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-slate-400 text-sm">Cargando…</p>
        </div>
      ) : camaras.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-3xl mb-3" aria-hidden="true">📡</p>
          <p className="font-medium text-slate-600 text-sm">Sin reportes todavía</p>
          <p className="text-slate-400 text-xs mt-1">
            Aparece aquí en cuanto la laptop del local empiece a reportar detecciones.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {camaras.map((c) => (
            <div
              key={c.camara_id}
              className={`bg-white rounded-xl border shadow-sm p-5 ${
                c.alerta_activa ? 'border-red-200' : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <p className="font-semibold text-sm text-[#0F172A]">{c.camara_nombre}</p>
                  <p className="text-xs text-slate-400">{c.ubicacion}</p>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${NIVEL_COLORS[c.nivel]}`}
                >
                  {NIVEL_LABELS[c.nivel]}
                </span>
              </div>

              <div className="flex items-end justify-between">
                <div>
                  <p className="text-3xl font-bold text-[#0F172A] leading-none">{c.personas}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    persona{c.personas !== 1 ? 's' : ''} detectada{c.personas !== 1 ? 's' : ''}
                  </p>
                </div>
                {c.tiene_evidencia && (
                  <button
                    onClick={() => void verEvidencia(c.camara_id)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Ver evidencia
                  </button>
                )}
              </div>

              <p className="text-[11px] text-slate-400 mt-3" title={formatDate(c.fecha_actualizacion)}>
                Actualizado {haceCuanto(c.fecha_actualizacion)}
              </p>
            </div>
          ))}
        </div>
      )}

      {evidencia && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setEvidencia(null)}
        >
          <img
            src={evidencia.src}
            alt={`Evidencia cámara ${evidencia.id}`}
            className="max-w-full max-h-full rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
