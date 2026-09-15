import { useState, useEffect } from 'react';
import type { CameraIP } from '../../types/api';
import {
  getCameras,
  createCamera,
  updateCamera,
  updateCameraStatus,
  updateCameraZona,
  deleteCamera,
} from '../../services/cameraService';
import { getExclusionZones } from '../../services/exclusionZoneService';
import type { ExclusionZoneConfig } from '../../types/zones';

interface FormState {
  nombre: string;
  direccion_ip: string;
  ubicacion: string;
  descripcion: string;
  activa: boolean;
  rtsp_usuario: string;
  rtsp_password: string;
  rtsp_puerto: string;
  rtsp_canal: string;
  rtsp_subtipo: string;
  zona_exclusion_id: string;
}

const EMPTY: FormState = {
  nombre: '',
  direccion_ip: '',
  ubicacion: '',
  descripcion: '',
  activa: true,
  rtsp_usuario: 'admin',
  rtsp_password: '',
  rtsp_puerto: '554',
  rtsp_canal: '1',
  rtsp_subtipo: '1',
  zona_exclusion_id: '',
};

export default function CamarasPage() {
  const [cameras, setCameras] = useState<CameraIP[]>([]);
  const [zones, setZones] = useState<ExclusionZoneConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [savingZonaId, setSavingZonaId] = useState<number | null>(null);

  async function load() {
    try {
      setLoading(true);
      const [cams, zoneList] = await Promise.all([
        getCameras(),
        getExclusionZones().catch(() => [] as ExclusionZoneConfig[]),
      ]);
      setCameras(cams);
      setZones(zoneList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar cámaras.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleZonaChange(cam: CameraIP, value: string) {
    const zonaId = value === '' ? null : Number(value);
    setSavingZonaId(cam.id);
    try {
      await updateCameraZona(cam.id, zonaId);
      flash('Zona de exclusión actualizada.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al actualizar la zona.');
    } finally {
      setSavingZonaId(null);
    }
  }

  function flash(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3500);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim() || !form.direccion_ip.trim() || !form.ubicacion.trim()) {
      setFormError('Nombre, dirección IP y ubicación son obligatorios.');
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      if (editingId !== null) {
        // Edición: solo se manda la contraseña si el usuario escribió algo
        // nuevo — en blanco significa "no cambiarla" (el backend la deja igual).
        await updateCamera(editingId, {
          nombre: form.nombre.trim(),
          direccion_ip: form.direccion_ip.trim(),
          ubicacion: form.ubicacion.trim(),
          descripcion: form.descripcion.trim(),
          rtsp_usuario: form.rtsp_usuario.trim() || 'admin',
          ...(form.rtsp_password.trim() ? { rtsp_password: form.rtsp_password.trim() } : {}),
          rtsp_puerto: parseInt(form.rtsp_puerto) || 554,
          rtsp_canal: parseInt(form.rtsp_canal) || 1,
          rtsp_subtipo: parseInt(form.rtsp_subtipo) || 1,
        });
        flash('Cámara actualizada correctamente.');
      } else {
        await createCamera({
          nombre: form.nombre.trim(),
          direccion_ip: form.direccion_ip.trim(),
          ubicacion: form.ubicacion.trim(),
          descripcion: form.descripcion.trim() || undefined,
          activa: form.activa,
          rtsp_usuario: form.rtsp_usuario.trim() || 'admin',
          rtsp_password: form.rtsp_password.trim() || undefined,
          rtsp_puerto: parseInt(form.rtsp_puerto) || 554,
          rtsp_canal: parseInt(form.rtsp_canal) || 1,
          rtsp_subtipo: parseInt(form.rtsp_subtipo) || 1,
          zona_exclusion_id: form.zona_exclusion_id ? Number(form.zona_exclusion_id) : null,
        });
        flash('Cámara registrada correctamente.');
      }
      setForm(EMPTY);
      setShowForm(false);
      setEditingId(null);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Error al guardar la cámara.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleEditClick(cam: CameraIP) {
    setEditingId(cam.id);
    setForm({
      nombre: cam.nombre,
      direccion_ip: cam.direccion_ip,
      ubicacion: cam.ubicacion,
      descripcion: cam.descripcion ?? '',
      activa: cam.activa,
      rtsp_usuario: cam.rtsp_usuario,
      rtsp_password: '',
      rtsp_puerto: String(cam.rtsp_puerto),
      rtsp_canal: String(cam.rtsp_canal),
      rtsp_subtipo: String(cam.rtsp_subtipo),
      zona_exclusion_id: cam.zona_exclusion_id != null ? String(cam.zona_exclusion_id) : '',
    });
    setFormError(null);
    setShowForm(true);
  }

  function handleCancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY);
    setFormError(null);
  }

  async function handleToggle(cam: CameraIP) {
    setTogglingId(cam.id);
    try {
      await updateCameraStatus(cam.id, !cam.activa);
      flash(`Cámara ${!cam.activa ? 'activada' : 'desactivada'}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al actualizar estado.');
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(cam: CameraIP) {
    if (!confirm(`¿Eliminar la cámara "${cam.nombre}"? Esta acción no se puede deshacer.`)) return;
    setDeletingId(cam.id);
    try {
      await deleteCamera(cam.id);
      flash('Cámara eliminada.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar cámara.');
    } finally {
      setDeletingId(null);
    }
  }

  function setField(key: keyof FormState, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Cámaras IP</h1>
          <p className="text-slate-500 text-sm mt-1">Solo administrador</p>
        </div>
        <button
          onClick={() => {
            if (showForm) { handleCancelForm(); } else { setEditingId(null); setForm(EMPTY); setShowForm(true); setFormError(null); }
          }}
          className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
        >
          {showForm ? 'Cancelar' : '+ Nueva cámara'}
        </button>
      </div>

      {success && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
          {success}
        </div>
      )}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex justify-between items-start">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-4 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {showForm && (
        <div className="mb-6 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-semibold text-[#0F172A] mb-4 text-base">
            {editingId !== null ? 'Editar cámara' : 'Registrar nueva cámara'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Datos generales */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {([
                { id: 'nombre', label: 'Nombre', placeholder: 'Cámara entrada principal', key: 'nombre', required: true },
                { id: 'ip', label: 'Dirección IP', placeholder: '192.168.1.100', key: 'direccion_ip', required: true },
                { id: 'ubicacion', label: 'Ubicación', placeholder: 'Planta baja — acceso norte', key: 'ubicacion', required: true },
                { id: 'descripcion', label: 'Descripción (opcional)', placeholder: 'Vista frontal del edificio', key: 'descripcion', required: false },
              ] as Array<{ id: string; label: string; placeholder: string; key: keyof FormState; required: boolean }>).map(({ id, label, placeholder, key, required }) => (
                <div key={id} className="flex flex-col gap-1">
                  <label htmlFor={id} className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    {label}{required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <input
                    id={id}
                    type="text"
                    value={form[key] as string}
                    onChange={(e) => setField(key, e.target.value)}
                    placeholder={placeholder}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              ))}
            </div>

            {/* Conexión RTSP */}
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Conexión RTSP</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label htmlFor="rtsp_usuario" className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    Usuario RTSP <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="rtsp_usuario"
                    type="text"
                    value={form.rtsp_usuario}
                    onChange={(e) => setField('rtsp_usuario', e.target.value)}
                    placeholder="admin"
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="rtsp_password" className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    Contraseña RTSP
                  </label>
                  <input
                    id="rtsp_password"
                    type="password"
                    value={form.rtsp_password}
                    onChange={(e) => setField('rtsp_password', e.target.value)}
                    placeholder={editingId !== null ? 'Dejar en blanco para no cambiarla' : 'Contraseña de la cámara'}
                    autoComplete="new-password"
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {editingId !== null && (
                    <p className="text-[10px] text-slate-400">En blanco = mantener la contraseña actual.</p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="rtsp_puerto" className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Puerto</label>
                  <input
                    id="rtsp_puerto"
                    type="number"
                    value={form.rtsp_puerto}
                    onChange={(e) => setField('rtsp_puerto', e.target.value)}
                    placeholder="554"
                    min="1"
                    max="65535"
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="rtsp_canal" className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Canal</label>
                    <input
                      id="rtsp_canal"
                      type="number"
                      value={form.rtsp_canal}
                      onChange={(e) => setField('rtsp_canal', e.target.value)}
                      placeholder="1"
                      min="1"
                      className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="rtsp_subtipo" className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Subtipo</label>
                    <input
                      id="rtsp_subtipo"
                      type="number"
                      value={form.rtsp_subtipo}
                      onChange={(e) => setField('rtsp_subtipo', e.target.value)}
                      placeholder="1"
                      min="0"
                      className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {editingId === null && (
              <div className="flex flex-col gap-1">
                <label htmlFor="zona_exclusion_id" className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Zona de exclusión por defecto
                </label>
                <select
                  id="zona_exclusion_id"
                  value={form.zona_exclusion_id}
                  onChange={(e) => setField('zona_exclusion_id', e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Sin zona (umbrales por defecto)</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>{z.nombre}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400">
                  Se aplica automáticamente en la vista multicámara, donde no hay selector manual por sesión.
                  Para una cámara existente, cambia la zona desde el selector en su tarjeta de abajo.
                </p>
              </div>
            )}

            {editingId === null && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="activa"
                  checked={form.activa}
                  onChange={(e) => setField('activa', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="activa" className="text-sm text-slate-600 select-none">
                  Activa al registrar
                </label>
              </div>
            )}

            {formError && (
              <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                {formError}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting
                  ? (editingId !== null ? 'Guardando...' : 'Registrando...')
                  : (editingId !== null ? 'Guardar cambios' : 'Registrar cámara')}
              </button>
              <button
                type="button"
                onClick={handleCancelForm}
                className="px-5 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-slate-400 text-sm">Cargando cámaras...</p>
        </div>
      ) : cameras.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-3xl mb-3">📷</p>
          <p className="font-medium text-slate-600 text-sm">Sin cámaras registradas</p>
          <p className="text-slate-400 text-xs mt-1">
            Usa el botón "Nueva cámara" para registrar la primera.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <p className="text-xs text-slate-500 font-medium">
              {cameras.length} {cameras.length === 1 ? 'cámara registrada' : 'cámaras registradas'}
            </p>
          </div>
          <ul className="divide-y divide-slate-100">
            {cameras.map((cam) => (
              <li key={cam.id} className="px-6 py-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-[#0F172A] text-sm">{cam.nombre}</p>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        cam.activa
                          ? 'bg-green-100 text-green-700 border border-green-200'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}
                    >
                      {cam.activa ? 'ACTIVA' : 'INACTIVA'}
                    </span>
                    {cam.rtsp_tiene_password && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                        RTSP configurado
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-slate-500 mt-0.5">{cam.direccion_ip}:{cam.rtsp_puerto}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{cam.ubicacion}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Canal {cam.rtsp_canal} · Subtipo {cam.rtsp_subtipo} · Usuario: {cam.rtsp_usuario}
                  </p>
                  {cam.descripcion && (
                    <p className="text-xs text-slate-400 mt-0.5 italic">{cam.descripcion}</p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide shrink-0">
                      Zona:
                    </label>
                    <select
                      value={cam.zona_exclusion_id ?? ''}
                      onChange={(e) => handleZonaChange(cam, e.target.value)}
                      disabled={savingZonaId === cam.id}
                      className="text-xs px-2 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-50"
                    >
                      <option value="">Sin zona (umbrales por defecto)</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>{z.nombre}</option>
                      ))}
                    </select>
                    {savingZonaId === cam.id && <span className="text-[10px] text-slate-400">Guardando…</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleEditClick(cam)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleToggle(cam)}
                    disabled={togglingId === cam.id}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                      cam.activa
                        ? 'border border-amber-200 text-amber-700 hover:bg-amber-50'
                        : 'border border-green-200 text-green-700 hover:bg-green-50'
                    }`}
                  >
                    {togglingId === cam.id ? '…' : cam.activa ? 'Desactivar' : 'Activar'}
                  </button>
                  <button
                    onClick={() => handleDelete(cam)}
                    disabled={deletingId === cam.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {deletingId === cam.id ? '…' : 'Eliminar'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
