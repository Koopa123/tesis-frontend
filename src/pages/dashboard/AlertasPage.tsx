import { useState, useEffect, useCallback } from 'react';
import type { Alerta } from '../../types/api';
import { getAlertas } from '../../services/alertaService';
import { useAlerts } from '../../context/AlertContext';

function formatDate(s: string | null): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return s; }
}

type Filtro = 'todas' | 'pendientes' | 'atendidas';

export default function AlertasPage() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { atenderAlerta: atenderAlertaCtx } = useAlerts();

  const atendidaParam = filtro === 'pendientes' ? false : filtro === 'atendidas' ? true : undefined;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setAlertas(await getAlertas(atendidaParam));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar alertas.');
    } finally {
      setLoading(false);
    }
  }, [atendidaParam]);

  useEffect(() => { void load(); }, [load]);

  async function handleAtender(id: number) {
    try {
      await atenderAlertaCtx(id); // también actualiza el badge del sidebar
      if (filtro === 'pendientes') {
        // en la vista de pendientes, el item atendido desaparece
        setAlertas((prev) => prev.filter((a) => a.id !== id));
      } else {
        setAlertas((prev) =>
          prev.map((a) =>
            a.id === id
              ? { ...a, atendida: true, fecha_atencion: new Date().toISOString() }
              : a,
          ),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al atender la alerta.');
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Historial de alertas</h1>
          <p className="text-slate-500 text-sm mt-1">
            Notificaciones de aglomeración detectadas
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
            {(['todas', 'pendientes', 'atendidas'] as Filtro[]).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`px-3 py-1.5 capitalize transition-colors ${
                  filtro === f
                    ? 'bg-[#2563EB] text-white'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-4 text-red-400 hover:text-red-600">
            ✕
          </button>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-slate-400 text-sm">Cargando alertas…</p>
        </div>
      ) : alertas.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-3xl mb-3" aria-hidden="true">🔔</p>
          <p className="font-medium text-slate-600 text-sm">Sin alertas registradas</p>
          <p className="text-slate-400 text-xs mt-1">
            Las alertas aparecen aquí cuando el sistema detecta nivel Alto sostenido.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {alertas.map((a) => (
            <AlertRow key={a.id} alerta={a} onAtender={handleAtender} />
          ))}
        </div>
      )}
    </div>
  );
}

function AlertRow({
  alerta,
  onAtender,
}: {
  alerta: Alerta;
  onAtender: (id: number) => void;
}) {
  return (
    <div
      className={`bg-white rounded-xl border shadow-sm p-5 flex items-start gap-4 flex-wrap transition-colors ${
        alerta.atendida ? 'border-slate-200' : 'border-red-200'
      }`}
    >
      <span
        className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
          alerta.atendida ? 'bg-slate-300' : 'bg-red-500'
        }`}
        aria-hidden="true"
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <span className="text-xs font-bold text-slate-400">
            {alerta.sesion_id !== null
              ? `Sesión #${alerta.sesion_id}`
              : alerta.camara_nombre
                ? `📡 ${alerta.camara_nombre}`
                : '📡 Reporte automático'}
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
            ALTO
          </span>
          <span className="text-xs text-slate-500">
            {alerta.personas} persona{alerta.personas !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex gap-4 text-xs text-slate-400 flex-wrap">
          <span>Detectada: {formatDate(alerta.fecha_alerta)}</span>
          {alerta.atendida && alerta.fecha_atencion && (
            <span>Atendida: {formatDate(alerta.fecha_atencion)}</span>
          )}
        </div>
      </div>

      <div className="shrink-0">
        {alerta.atendida ? (
          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-green-100 text-green-700 border border-green-200">
            ✓ Atendida
          </span>
        ) : (
          <button
            onClick={() => onAtender(alerta.id)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#2563EB] text-white hover:bg-blue-700 transition-colors"
          >
            Marcar atendida
          </button>
        )}
      </div>
    </div>
  );
}
