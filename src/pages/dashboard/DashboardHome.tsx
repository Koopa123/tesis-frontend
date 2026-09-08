import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAlerts } from '../../context/AlertContext';
import { getCameras } from '../../services/cameraService';
import { getExclusionZones } from '../../services/exclusionZoneService';

interface QuickLink {
  to: string;
  icon: string;
  title: string;
  description: string;
  accent: string;
}

const OPERACION_LINKS: QuickLink[] = [
  {
    to: '/dashboard/monitoreo',
    icon: '▶',
    title: 'Monitoreo',
    description: 'Selecciona una fuente de video, inicia y detén sesiones de monitoreo.',
    accent: 'border-blue-200 hover:border-blue-400 hover:shadow-blue-50',
  },
  {
    to: '/dashboard/multicamara',
    icon: '⊞',
    title: 'Multi-cámara',
    description: 'Supervisa varias cámaras IP a la vez desde una sola vista.',
    accent: 'border-blue-200 hover:border-blue-400 hover:shadow-blue-50',
  },
  {
    to: '/dashboard/grabaciones',
    icon: '▣',
    title: 'Grabaciones',
    description: 'Sube y gestiona videos previos para usarlos en sesiones de monitoreo.',
    accent: 'border-slate-200 hover:border-slate-400 hover:shadow-slate-50',
  },
  {
    to: '/dashboard/historial',
    icon: '◈',
    title: 'Historial',
    description: 'Consulta los resultados de análisis guardados por sesión.',
    accent: 'border-slate-200 hover:border-slate-400 hover:shadow-slate-50',
  },
  {
    to: '/dashboard/alertas',
    icon: '⚠',
    title: 'Alertas',
    description: 'Revisa y atiende las notificaciones de aglomeración detectadas.',
    accent: 'border-red-200 hover:border-red-400 hover:shadow-red-50',
  },
];

const GESTION_LINKS: QuickLink[] = [
  {
    to: '/dashboard/camaras',
    icon: '⊕',
    title: 'Cámaras IP',
    description: 'Registra y gestiona cámaras IP de la red interna.',
    accent: 'border-cyan-200 hover:border-cyan-400 hover:shadow-cyan-50',
  },
  {
    to: '/dashboard/zonas-exclusion',
    icon: '◧',
    title: 'Zonas de exclusión',
    description: 'Define áreas que el sistema debe ignorar: vitrinas, maniquíes, mobiliario fijo.',
    accent: 'border-violet-200 hover:border-violet-400 hover:shadow-violet-50',
  },
];

function QuickLinkGrid({ links }: { links: QuickLink[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {links.map((s) => (
        <Link
          key={s.to}
          to={s.to}
          className={`group block bg-white rounded-xl border-2 p-5 transition-all duration-200 hover:shadow-md ${s.accent}`}
        >
          <span className="text-2xl mb-3 block" aria-hidden="true">{s.icon}</span>
          <h3 className="font-semibold text-[#0F172A] text-sm mb-1">{s.title}</h3>
          <p className="text-slate-500 text-xs leading-relaxed">{s.description}</p>
        </Link>
      ))}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className={`bg-white rounded-xl border-2 p-4 ${accent}`}>
      <p className="text-2xl font-bold text-[#0F172A]">{value}</p>
      <p className="text-slate-500 text-xs mt-1">{label}</p>
    </div>
  );
}

function AdminHome({ nombre }: { nombre: string }) {
  const { pendingAlerts } = useAlerts();
  const [stats, setStats] = useState<{ camaras: number; camarasActivas: number; zonas: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getCameras(), getExclusionZones()])
      .then(([camaras, zonas]) => {
        if (cancelled) return;
        setStats({
          camaras: camaras.length,
          camarasActivas: camaras.filter((c) => c.activa).length,
          zonas: zonas.length,
        });
      })
      .catch(() => { /* estadísticas informativas: si fallan, se muestran vacías */ });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#0F172A]">Bienvenido, {nombre}</h1>
        <p className="text-slate-500 mt-1 text-sm">Panel de administración · CrowdSense AI</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard label="Cámaras registradas" value={stats?.camaras ?? '—'} accent="border-cyan-100" />
        <StatCard label="Cámaras activas" value={stats?.camarasActivas ?? '—'} accent="border-blue-100" />
        <StatCard label="Zonas configuradas" value={stats?.zonas ?? '—'} accent="border-violet-100" />
        <StatCard label="Alertas pendientes" value={pendingAlerts.length} accent="border-red-100" />
      </div>

      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Gestión</h2>
      <div className="mb-8">
        <QuickLinkGrid links={GESTION_LINKS} />
      </div>

      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Operación</h2>
      <QuickLinkGrid links={OPERACION_LINKS} />
    </div>
  );
}

function VigilanteHome({ nombre }: { nombre: string }) {
  const { pendingAlerts } = useAlerts();

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#0F172A]">Bienvenido, {nombre}</h1>
        <p className="text-slate-500 mt-1 text-sm">Panel de vigilancia · CrowdSense AI</p>
      </div>

      {pendingAlerts.length > 0 && (
        <Link
          to="/dashboard/alertas"
          className="mb-8 flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-4 hover:bg-red-100 transition-colors"
        >
          <span className="text-2xl" aria-hidden="true">⚠</span>
          <div>
            <p className="font-semibold text-red-700 text-sm">
              {pendingAlerts.length} alerta{pendingAlerts.length !== 1 ? 's' : ''} pendiente{pendingAlerts.length !== 1 ? 's' : ''}
            </p>
            <p className="text-red-500 text-xs mt-0.5">Toca para revisarlas</p>
          </div>
        </Link>
      )}

      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Acceso rápido</h2>
      <QuickLinkGrid links={OPERACION_LINKS} />
    </div>
  );
}

export default function DashboardHome() {
  const { user, isAdmin } = useAuth();
  const nombre = user?.nombre?.split(' ')[0] ?? 'usuario';

  return isAdmin ? <AdminHome nombre={nombre} /> : <VigilanteHome nombre={nombre} />;
}
