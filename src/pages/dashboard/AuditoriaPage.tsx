import { useState, useEffect, useCallback } from 'react';
import { getAuditoria, type RegistroAuditoria } from '../../services/auditoriaService';

// Nombres legibles de las acciones que registra el backend (app/core/auditoria.py).
const ACCIONES: Record<string, string> = {
  ver_evidencia: 'Vio una foto de evidencia',
  ver_clip: 'Vio un clip de alerta',
  ver_grabacion: 'Reprodujo una grabación',
  ver_camara: 'Abrió una cámara en vivo',
  foto_camara: 'Tomó una foto de cámara',
  login_exitoso: 'Inició sesión',
  login_fallido: 'Intento de inicio de sesión fallido',
  login_bloqueado: 'Inicio de sesión bloqueado',
  activar_usuario: 'Activó una cuenta',
  desactivar_usuario: 'Desactivó una cuenta',
  rechazar_usuario: 'Rechazó una cuenta',
  crear_camara: 'Registró una cámara',
  editar_camara: 'Editó una cámara',
  activar_camara: 'Activó una cámara',
  desactivar_camara: 'Desactivó una cámara',
  zona_camara: 'Cambió la zona de una cámara',
  eliminar_camara: 'Eliminó una cámara',
  crear_zona: 'Creó una zona de exclusión',
  editar_zona: 'Editó una zona de exclusión',
  eliminar_zona: 'Eliminó una zona de exclusión',
  subir_grabacion: 'Subió una grabación',
  eliminar_grabacion: 'Eliminó una grabación',
  eliminar_resultado: 'Eliminó un resultado del historial',
  atender_alerta: 'Atendió una alerta',
  borrado_automatico: 'Borrado automático de evidencias',
  respaldo_bd: 'Respaldo diario de la base de datos',
  sistema_iniciado: 'Se inició el sistema',
  sistema_detenido: 'Se detuvo el sistema',
  camara_sin_senal: 'Cámara sin señal',
  camara_reconectada: 'Cámara reconectada',
};

// Acciones sobre imágenes de personas: se resaltan porque son las que importan para detectar una fuga.
const ACCESO_A_IMAGENES = new Set(['ver_evidencia', 'ver_clip', 'ver_grabacion', 'ver_camara', 'foto_camara']);

function formatDate(s: string): string {
  try {
    return new Date(s).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'medium' });
  } catch { return s; }
}

export default function AuditoriaPage() {
  const [registros, setRegistros] = useState<RegistroAuditoria[]>([]);
  const [accion, setAccion] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setRegistros(await getAuditoria(accion || undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar la auditoría.');
    } finally {
      setLoading(false);
    }
  }, [accion]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Auditoría</h1>
          <p className="text-slate-500 text-sm mt-1">
            Quién vio fotos, clips, grabaciones o cámaras, y quién cambió cuentas, cámaras o zonas.
            Se muestran los 200 registros más recientes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={accion}
            onChange={(e) => setAccion(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
            aria-label="Filtrar por acción"
          >
            <option value="">Todas las acciones</option>
            {Object.entries(ACCIONES).map(([valor, texto]) => (
              <option key={valor} value={valor}>{texto}</option>
            ))}
          </select>
          <button
            onClick={() => void load()}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
          >
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-slate-400 text-sm">Cargando…</p>
        </div>
      ) : registros.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-slate-400 text-sm">No hay registros para este filtro.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Usuario</th>
                <th className="px-4 py-3 font-medium">Acción</th>
                <th className="px-4 py-3 font-medium">Recurso</th>
                <th className="px-4 py-3 font-medium">Detalle</th>
                <th className="px-4 py-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((r) => (
                <tr key={r.id} className={`border-t border-slate-100 ${ACCESO_A_IMAGENES.has(r.accion) ? 'bg-amber-50/40' : ''}`}>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{formatDate(r.fecha)}</td>
                  <td className="px-4 py-2.5 text-slate-800">{r.usuario_nombre ?? (r.usuario_id == null ? 'Sistema / desconocido' : `#${r.usuario_id}`)}</td>
                  <td className="px-4 py-2.5 text-slate-700">{ACCIONES[r.accion] ?? r.accion}</td>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                    {r.recurso ? `${r.recurso}${r.recurso_id != null ? ` #${r.recurso_id}` : ''}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{r.detalle ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{r.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
