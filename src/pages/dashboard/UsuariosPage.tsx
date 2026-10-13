import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  getUsuarios,
  rechazarUsuario,
  setEstadoUsuario,
  type UsuarioAdmin,
} from '../../services/usuarioService';

function formatDate(s: string | null): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return s; }
}

export default function UsuariosPage() {
  const { user } = useAuth();
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setUsuarios(await getUsuarios());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar los usuarios.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function accion(id: number, fn: () => Promise<unknown>) {
    setOcupado(id);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción.');
    } finally {
      setOcupado(null);
    }
  }

  function rechazar(u: UsuarioAdmin) {
    if (!window.confirm(`¿Rechazar y eliminar la cuenta de ${u.nombre} (${u.email})?`)) return;
    void accion(u.id, () => rechazarUsuario(u.id));
  }

  const pendientes = usuarios.filter((u) => !u.activo).length;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0F172A]">Usuarios</h1>
        <p className="text-slate-500 text-sm mt-1">
          Las cuentas creadas desde el registro público quedan desactivadas hasta que las actives.
          {pendientes > 0 && (
            <span className="ml-1 font-medium text-amber-700">
              {pendientes === 1 ? 'Hay 1 cuenta desactivada.' : `Hay ${pendientes} cuentas desactivadas.`}
            </span>
          )}
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
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Correo</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Registro</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => {
                const esYo = u.id === user?.id;
                return (
                  <tr key={u.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {u.nombre}{esYo && <span className="ml-1 text-xs text-slate-400">(tú)</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{u.email}</td>
                    <td className="px-4 py-3 text-slate-600 capitalize">{u.rol}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${
                          u.activo
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {u.activo ? 'Activa' : 'Desactivada'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(u.fecha_creacion)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {esYo ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : u.activo ? (
                        <button
                          disabled={ocupado === u.id}
                          onClick={() => void accion(u.id, () => setEstadoUsuario(u.id, false))}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Desactivar
                        </button>
                      ) : (
                        <div className="inline-flex gap-2">
                          <button
                            disabled={ocupado === u.id}
                            onClick={() => void accion(u.id, () => setEstadoUsuario(u.id, true))}
                            className="px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            Activar
                          </button>
                          <button
                            disabled={ocupado === u.id}
                            onClick={() => rechazar(u)}
                            className="px-3 py-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            Rechazar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
