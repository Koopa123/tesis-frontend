import { useState, useEffect, useRef, useCallback } from 'react';
import type { ExclusionRect, ExclusionZoneConfig } from '../../types/zones';
import {
  getExclusionZones,
  createExclusionZone,
  updateExclusionZone,
  deleteExclusionZone,
} from '../../services/exclusionZoneService';
import { getCameras, getCameraPhoto } from '../../services/cameraService';
import type { CameraIP } from '../../types/api';
import ZoneEditor from '../../components/zones/ZoneEditor';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const ALLOWED_IMG_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
const ALLOWED_VID_EXTS = ['.mp4', '.avi', '.mov', '.mkv', '.webm'];

type Mode = 'list' | 'create' | 'edit';
type FrameSource = 'none' | 'image' | 'video' | 'camera';
const CAMERA_PHOTO_NAME = 'foto_camara.jpg';

function backendFrameUrl(path: string): string {
  return `${API_URL}/${path.replace(/\\/g, '/')}`;
}

function formatDate(s: string | null): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return s;
  }
}

export default function ZonasExclusionPage() {
  const [mode, setMode] = useState<Mode>('list');
  const [configs, setConfigs] = useState<ExclusionZoneConfig[]>([]);
  const [editingConfig, setEditingConfig] = useState<ExclusionZoneConfig | null>(null);

  // Form state
  const [nombre, setNombre] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rects, setRects] = useState<ExclusionRect[]>([]);

  // Threshold state (EP-003)
  const [umbralMedio, setUmbralMedio] = useState(4);
  const [umbralAlto, setUmbralAlto] = useState(6);
  const [ventanaSeg, setVentanaSeg] = useState(2.0);
  const [cooldownSeg, setCooldownSeg] = useState(10);

  // Frame source picker
  const [frameSource, setFrameSource] = useState<FrameSource>('none');

  // Video extraction state
  const [videoObjectUrl, setVideoObjectUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [capturing, setCapturing] = useState(false);

  // Live camera photo state
  const [cameras, setCameras] = useState<CameraIP[]>([]);
  const [cameraId, setCameraId] = useState<number | null>(null);
  const [takingPhoto, setTakingPhoto] = useState(false);

  // UI state
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Refs
  const imgFileInputRef = useRef<HTMLInputElement>(null);
  const vidFileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blobUrlRef = useRef<string | null>(null);

  function setBlobImage(file: File) {
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    const url = URL.createObjectURL(file);
    blobUrlRef.current = url;
    setImageUrl(url);
  }

  function clearVideoState() {
    if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
    setVideoObjectUrl(null);
    setVideoDuration(0);
    setCurrentTime(0);
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
    };
  }, [videoObjectUrl]);

  const loadConfigs = useCallback(async () => {
    try {
      setLoadingList(true);
      setConfigs(await getExclusionZones());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar configuraciones.');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { void loadConfigs(); }, [loadConfigs]);

  function flash(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3500);
  }

  function resetEditor() {
    setNombre('');
    setSelectedFile(null);
    setImageUrl(null);
    setRects([]);
    setFrameSource('none');
    setError(null);
    setFileError(null);
    setUmbralMedio(4);
    setUmbralAlto(6);
    setVentanaSeg(2.0);
    setCooldownSeg(10);
    clearVideoState();
  }

  function openCreate() {
    setMode('create');
    setEditingConfig(null);
    resetEditor();
  }

  function openEdit(config: ExclusionZoneConfig) {
    setMode('edit');
    setEditingConfig(config);
    setNombre(config.nombre);
    setSelectedFile(null);
    setImageUrl(backendFrameUrl(config.frame_referencia));
    setRects(config.zonas as ExclusionRect[]);
    setFrameSource('image');
    setUmbralMedio(config.umbral_medio);
    setUmbralAlto(config.umbral_alto);
    setVentanaSeg(config.ventana_segundos);
    setCooldownSeg(config.cooldown_segundos);
    setError(null);
    setFileError(null);
    clearVideoState();
  }

  function handleBack() {
    setMode('list');
    setEditingConfig(null);
    setError(null);
    clearVideoState();
  }

  // ── Image file handler ───────────────────────────────────────────────────────
  function handleImgFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
    if (!ALLOWED_IMG_EXTS.includes(ext)) {
      setFileError(`Formato no permitido. Usa: ${ALLOWED_IMG_EXTS.join(', ')}`);
      return;
    }
    setFileError(null);
    setSelectedFile(file);
    setBlobImage(file);
    setRects([]);
    setFrameSource('image');
    clearVideoState();
  }

  // ── Video file handler ───────────────────────────────────────────────────────
  function handleVidFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
    if (!ALLOWED_VID_EXTS.includes(ext)) {
      setFileError(`Formato de video no permitido. Usa: ${ALLOWED_VID_EXTS.join(', ')}`);
      return;
    }
    setFileError(null);

    clearVideoState();
    const url = URL.createObjectURL(file);
    setVideoObjectUrl(url);
    setCurrentTime(0);
    setFrameSource('video');
    setImageUrl(null); // clear previous image until frame is captured
  }

  function handleVideoLoaded() {
    const video = videoRef.current;
    if (!video) return;
    setVideoDuration(video.duration || 0);
    video.currentTime = 0;
  }

  function handleSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const t = Number(e.target.value);
    setCurrentTime(t);
    if (videoRef.current) videoRef.current.currentTime = t;
  }

  function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    setCapturing(true);

    // Draw current video frame to hidden canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setCapturing(false); return; }
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      setCapturing(false);
      if (!blob) { setFileError('No se pudo capturar el frame. Intenta con otro momento.'); return; }

      const file = new File([blob], 'frame_capturado.jpg', { type: 'image/jpeg' });
      setSelectedFile(file);
      setBlobImage(file);
      setRects([]);
      setFileError(null);
      // Keep videoObjectUrl alive until user goes back; cleared on mode change
    }, 'image/jpeg', 0.92);
  }

  // ── Live camera photo ───────────────────────────────────────────────────────
  async function openCameraPicker() {
    setFrameSource('camera');
    setFileError(null);
    clearVideoState();
    try {
      const activas = (await getCameras()).filter((c) => c.activa);
      setCameras(activas);
      setCameraId((prev) => prev ?? activas[0]?.id ?? null);
    } catch (e) {
      setFileError(e instanceof Error ? e.message : 'No se pudieron cargar las cámaras.');
    }
  }

  async function takeCameraPhoto() {
    if (cameraId === null) return;
    setTakingPhoto(true);
    setFileError(null);
    try {
      const blob = await getCameraPhoto(cameraId);
      const file = new File([blob], CAMERA_PHOTO_NAME, { type: 'image/jpeg' });
      setSelectedFile(file);
      setBlobImage(file);
      setRects([]);
    } catch (e) {
      setFileError(e instanceof Error ? e.message : 'No se pudo tomar la foto de la cámara.');
    } finally {
      setTakingPhoto(false);
    }
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  async function handleSave() {
    setError(null);
    if (!nombre.trim()) { setError('El nombre es requerido.'); return; }
    if (mode === 'create' && !selectedFile) { setError('Captura o sube un frame de referencia para continuar.'); return; }
    // Dibujar rectángulos es opcional: esta configuración también sirve solo
    // para personalizar umbrales sin excluir ninguna área del conteo.
    if (umbralAlto <= umbralMedio) { setError('El umbral Alto debe ser mayor que el umbral Medio.'); return; }

    setSaving(true);
    const thresholds = { umbral_medio: umbralMedio, umbral_alto: umbralAlto, ventana_segundos: ventanaSeg, cooldown_segundos: cooldownSeg };
    try {
      if (mode === 'create' && selectedFile) {
        await createExclusionZone(nombre.trim(), selectedFile, rects, thresholds);
        flash('Configuración creada correctamente.');
      } else if (mode === 'edit' && editingConfig) {
        await updateExclusionZone(editingConfig.id, {
          nombre: nombre.trim(),
          frame: selectedFile ?? undefined,
          zonas: rects,
          ...thresholds,
        });
        flash('Configuración actualizada correctamente.');
      }
      await loadConfigs();
      setMode('list');
      clearVideoState();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar configuración.');
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function handleDelete(config: ExclusionZoneConfig) {
    if (!confirm(`¿Eliminar la configuración "${config.nombre}"?\nEsta acción no se puede deshacer.`)) return;
    setDeletingId(config.id);
    setError(null);
    try {
      await deleteExclusionZone(config.id);
      flash(`"${config.nombre}" eliminada correctamente.`);
      await loadConfigs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar configuración.');
    } finally {
      setDeletingId(null);
    }
  }

  function formatTime(s: number): string {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // LIST MODE
  // ══════════════════════════════════════════════════════════════════════════════
  if (mode === 'list') {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Zonas de exclusión</h1>
            <p className="text-slate-500 text-sm mt-1">Solo administrador</p>
          </div>
          <button
            onClick={openCreate}
            className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
          >
            + Nueva configuración
          </button>
        </div>

        <div className="mb-6 px-4 py-3 rounded-xl bg-[#0F172A] border border-slate-700 flex gap-3">
          <span className="text-cyan-400 text-base shrink-0 mt-0.5" aria-hidden="true">ℹ</span>
          <p className="text-sm text-slate-300 leading-relaxed">
            Sube un frame de referencia del sector y dibuja las áreas que el sistema debe ignorar,
            como vitrinas, maniquíes o mobiliario fijo. Puedes subir una imagen directamente
            o <strong className="text-white">extraer un frame de un video</strong> sin necesidad
            de subirlo completo.
          </p>
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

        {loadingList ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <p className="text-slate-400 text-sm">Cargando configuraciones...</p>
          </div>
        ) : configs.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <p className="text-3xl mb-3" aria-hidden="true">🗺</p>
            <p className="font-medium text-slate-600 text-sm">Sin configuraciones de zonas</p>
            <p className="text-slate-400 text-xs mt-1">
              Crea la primera con el botón "Nueva configuración".
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {configs.map((cfg) => (
              <div key={cfg.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="h-36 bg-slate-900 overflow-hidden">
                  <img
                    src={backendFrameUrl(cfg.frame_referencia)}
                    alt={cfg.nombre}
                    className="w-full h-full object-cover opacity-80"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-[#0F172A] text-sm leading-tight">{cfg.nombre}</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 border border-cyan-200 shrink-0">
                      {cfg.zonas.length} zona{cfg.zonas.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-4">
                    Actualizado: {formatDate(cfg.fecha_actualizacion ?? cfg.fecha_creacion)}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEdit(cfg)}
                      className="flex-1 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(cfg)}
                      disabled={deletingId === cfg.id}
                      className="flex-1 py-1.5 rounded-lg border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {deletingId === cfg.id ? 'Eliminando…' : 'Eliminar'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // EDITOR MODE (create / edit)
  // ══════════════════════════════════════════════════════════════════════════════

  // Determine what to show in the frame section
  const showVideoPicker = frameSource === 'video' && videoObjectUrl && !imageUrl;
  const showCameraPicker = frameSource === 'camera' && !imageUrl;
  const showZoneEditor = imageUrl !== null;
  const showSourcePicker = !showVideoPicker && !showCameraPicker && !showZoneEditor;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Hidden elements for frame capture */}
      <video
        ref={videoRef}
        src={videoObjectUrl ?? undefined}
        onLoadedMetadata={handleVideoLoaded}
        className="hidden"
        muted
        playsInline
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Hidden file inputs */}
      <input
        ref={imgFileInputRef}
        type="file"
        accept={ALLOWED_IMG_EXTS.join(',')}
        onChange={handleImgFileChange}
        className="hidden"
      />
      <input
        ref={vidFileInputRef}
        type="file"
        accept={ALLOWED_VID_EXTS.join(',')}
        onChange={handleVidFileChange}
        className="hidden"
      />

      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <button
          onClick={handleBack}
          className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors text-sm"
        >
          ← Volver
        </button>
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">
            {mode === 'create' ? 'Nueva configuración' : `Editar: ${editingConfig?.nombre}`}
          </h1>
        </div>
      </div>

      {/* Alerts */}
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

      <div className="flex flex-col gap-5">

        {/* ── Nombre ─────────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-2">
            Nombre del conjunto <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Pasillo A, Entrada principal, Vitrina norte…"
            maxLength={120}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-slate-400 mt-1.5">
            Identifica el conjunto completo de zonas, no cada rectángulo individual.
          </p>
        </div>

        {/* ── Frame section ───────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Frame de referencia
              {mode === 'create' && <span className="text-red-500 ml-0.5">*</span>}
            </p>
            {showZoneEditor && (
              <div className="flex gap-2">
                <button
                  onClick={() => imgFileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Subir otra imagen
                </button>
                <button
                  onClick={() => { setImageUrl(null); setSelectedFile(null); setRects([]); setFrameSource('none'); }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Cambiar fuente
                </button>
              </div>
            )}
          </div>

          {fileError && <p className="text-xs text-red-600 mb-3">{fileError}</p>}

          {/* ── A: Source picker ── */}
          {showSourcePicker && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Option 0 — Live photo from an IP camera */}
              <button
                onClick={() => { void openCameraPicker(); }}
                className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-dashed border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors text-center"
              >
                <span className="text-4xl" aria-hidden="true">📷</span>
                <div>
                  <p className="text-sm font-semibold text-[#0F172A]">Tomar foto de una cámara</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Lo que la cámara ve ahora mismo. Solo desde el equipo del local.
                  </p>
                </div>
              </button>

              {/* Option 1 — Upload image */}
              <button
                onClick={() => imgFileInputRef.current?.click()}
                className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-dashed border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 transition-colors text-center"
              >
                <span className="text-4xl" aria-hidden="true">🖼</span>
                <div>
                  <p className="text-sm font-semibold text-[#0F172A]">Subir imagen</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    JPG, PNG, WEBP · captura de pantalla o foto del sector
                  </p>
                </div>
              </button>

              {/* Option 2 — Extract from video */}
              <button
                onClick={() => vidFileInputRef.current?.click()}
                className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-dashed border-slate-200 hover:border-cyan-300 hover:bg-cyan-50/20 transition-colors text-center"
              >
                <span className="text-4xl" aria-hidden="true">🎞</span>
                <div>
                  <p className="text-sm font-semibold text-[#0F172A]">Extraer frame de video</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    El video <strong className="text-slate-500">no se sube</strong> al servidor.
                    Solo el frame que elijas.
                  </p>
                </div>
              </button>
            </div>
          )}

          {/* ── B: Video frame picker ── */}
          {showVideoPicker && (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl bg-slate-950 overflow-hidden border border-slate-700">
                <video
                  src={videoObjectUrl ?? undefined}
                  className="w-full block"
                  muted
                  playsInline
                  onLoadedMetadata={handleVideoLoaded}
                />
              </div>

              {/* Slider */}
              {videoDuration > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Posición: {formatTime(currentTime)}</span>
                    <span>Duración: {formatTime(videoDuration)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={videoDuration}
                    step={0.05}
                    value={currentTime}
                    onChange={handleSliderChange}
                    className="w-full accent-cyan-400"
                  />
                  <p className="text-xs text-slate-500 text-center">
                    Arrastra el slider para elegir el momento del video que usarás como referencia.
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={captureFrame}
                  disabled={capturing || videoDuration === 0}
                  className="flex-1 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {capturing ? 'Capturando…' : '📸 Capturar este frame'}
                </button>
                <button
                  onClick={() => { setFrameSource('none'); clearVideoState(); setFileError(null); }}
                  className="px-4 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* ── B2: Live camera photo picker ── */}
          {showCameraPicker && (
            <div className="flex flex-col gap-4">
              {cameras.length === 0 && !fileError ? (
                <p className="text-sm text-slate-500">No hay cámaras activas registradas.</p>
              ) : (
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-slate-500">Cámara</span>
                  <select
                    value={cameraId ?? ''}
                    onChange={(e) => setCameraId(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {cameras.map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre} — {c.direccion_ip}</option>
                    ))}
                  </select>
                </label>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => { void takeCameraPhoto(); }}
                  disabled={takingPhoto || cameraId === null}
                  className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {takingPhoto ? 'Tomando foto… (puede tardar unos segundos)' : '📷 Tomar foto'}
                </button>
                <button
                  onClick={() => { setFrameSource('none'); setFileError(null); }}
                  className="px-4 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* ── C: Zone editor (image loaded) ── */}
          {showZoneEditor && (
            <>
              {selectedFile && (
                <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
                  <span className="text-green-500">✓</span>
                  <span>
                    {selectedFile.name === 'frame_capturado.jpg'
                      ? 'Frame extraído del video listo para usar'
                      : selectedFile.name === CAMERA_PHOTO_NAME
                        ? `Foto de ${cameras.find((c) => c.id === cameraId)?.nombre ?? 'la cámara'} lista para usar`
                        : `Imagen lista: ${selectedFile.name}`}
                  </span>
                </div>
              )}
              {mode === 'edit' && !selectedFile && (
                <p className="mb-3 text-xs text-slate-400">
                  Mostrando frame guardado. El frame solo cambia si subes uno nuevo.
                </p>
              )}
              <ZoneEditor imageUrl={imageUrl} rects={rects} onChange={setRects} />
            </>
          )}
        </div>

        {/* ── Umbrales de detección ──────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
            Umbrales de concentración
          </p>
          <p className="text-xs text-slate-400 mb-4">
            Define cuántas personas activan cada nivel de alerta para este espacio.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">
                Umbral Medio <span className="text-red-400">*</span>
              </label>
              <input type="number" min={1} max={50} value={umbralMedio}
                onChange={(e) => setUmbralMedio(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              <p className="text-[10px] text-slate-400 mt-1">Personas mín. nivel Medio</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">
                Umbral Alto <span className="text-red-400">*</span>
              </label>
              <input type="number" min={1} max={100} value={umbralAlto}
                onChange={(e) => setUmbralAlto(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              <p className="text-[10px] text-slate-400 mt-1">Personas mín. nivel Alto</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Ventana (s)</label>
              <input type="number" min={0.5} max={30} step={0.5} value={ventanaSeg}
                onChange={(e) => setVentanaSeg(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <p className="text-[10px] text-slate-400 mt-1">Ventana alerta sostenida</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Cooldown (s)</label>
              <input type="number" min={1} max={300} value={cooldownSeg}
                onChange={(e) => setCooldownSeg(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <p className="text-[10px] text-slate-400 mt-1">Pausa entre alertas</p>
            </div>
          </div>
        </div>

        {/* ── Info note ──────────────────────────────────────────────────────── */}
        <div className="px-4 py-3 rounded-xl bg-[#0F172A] border border-slate-700 flex gap-3">
          <span className="text-cyan-400 text-base shrink-0 mt-0.5" aria-hidden="true">ℹ</span>
          <p className="text-xs text-slate-300 leading-relaxed">
            Las coordenadas se guardan normalizadas entre 0 y 1, independientemente
            de la resolución del frame. Dibuja un rectángulo por cada área fija que
            el sistema deba ignorar (vitrinas, maniquíes, mobiliario).
          </p>
        </div>

        {/* ── Save / Cancel ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <button
            onClick={handleBack}
            className="px-4 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving
              ? 'Guardando…'
              : mode === 'create'
              ? 'Guardar configuración'
              : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
