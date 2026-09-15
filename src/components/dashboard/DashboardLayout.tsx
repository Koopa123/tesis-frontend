import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAlerts } from '../../context/AlertContext';
import AlertToast from '../alerts/AlertToast';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

export default function DashboardLayout() {
  const { user, logout, isAdmin } = useAuth();
  const { pendingAlerts } = useAlerts();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems: NavItem[] = [
    { to: '/dashboard', label: 'Inicio', icon: '◉', end: true },
    { to: '/dashboard/monitoreo', label: 'Monitoreo', icon: '▶' },
    { to: '/dashboard/multicamara', label: 'Multi-cámara', icon: '⊞' },
    { to: '/dashboard/historial', label: 'Historial', icon: '◈' },
    { to: '/dashboard/alertas', label: 'Alertas', icon: '⚠' },
    { to: '/dashboard/estado-edge', label: 'Estado en vivo', icon: '📡' },
  ];

  const gestionNavItems: NavItem[] = isAdmin
    ? [
        { to: '/dashboard/camaras', label: 'Cámaras IP', icon: '⊕' },
        { to: '/dashboard/zonas-exclusion', label: 'Zonas de exclusión', icon: '◧' },
      ]
    : [];

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-[#2563EB] text-white'
        : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
    }`;

  const sidebarInner = (
    <div className="flex flex-col h-full">
      <div className="px-5 py-5 border-b border-slate-700/60">
        <Link to="/" className="flex flex-col leading-none">
          <span className="text-white font-bold text-lg tracking-tight">
            Crowd<span className="text-cyan-400">Sense</span> AI
          </span>
          <span className="text-slate-500 text-[10px] tracking-widest uppercase mt-0.5">
            Panel de control
          </span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
        {navItems.map((item) => {
          const isAlertas = item.to === '/dashboard/alertas';
          const badge = isAlertas && pendingAlerts.length > 0 ? pendingAlerts.length : 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={navLinkClass}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="text-base w-5 text-center shrink-0" aria-hidden="true">
                {item.icon}
              </span>
              <span className="flex-1">{item.label}</span>
              {badge > 0 && (
                <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </NavLink>
          );
        })}

        {gestionNavItems.length > 0 && (
          <>
            <p className="mt-4 mb-1 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
              Gestión
            </p>
            {gestionNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={navLinkClass}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="text-base w-5 text-center shrink-0" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="flex-1">{item.label}</span>
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="px-3 py-4 border-t border-slate-700/60">
        {user && (
          <div className="px-3 py-3 mb-2 rounded-lg bg-slate-700/40">
            <p className="text-sm font-semibold text-white truncate">{user.nombre}</p>
            <p className="text-xs text-slate-400 truncate mt-0.5">{user.email}</p>
            <span
              className={`mt-2 inline-block text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wider ${
                isAdmin
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : 'bg-slate-600/60 text-slate-300 border border-slate-500/30'
              }`}
            >
              {isAdmin ? 'ADMINISTRADOR' : 'VIGILANTE'}
            </span>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <span aria-hidden="true" className="text-base w-5 text-center shrink-0">⊗</span>
          Cerrar sesión
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar desktop */}
      <aside className="hidden lg:flex flex-col w-60 bg-[#0F172A] fixed inset-y-0 left-0 z-30">
        {sidebarInner}
      </aside>

      {/* Sidebar mobile overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative flex flex-col w-64 bg-[#0F172A] z-50 shadow-2xl">
            {sidebarInner}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 lg:pl-60 flex flex-col min-h-screen">
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-20 bg-[#0F172A] border-b border-slate-700 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors"
            aria-label="Abrir menú"
          >
            <div className="space-y-1">
              <span className="block w-5 h-0.5 bg-white rounded" />
              <span className="block w-5 h-0.5 bg-white rounded" />
              <span className="block w-5 h-0.5 bg-white rounded" />
            </div>
          </button>
          <span className="text-white font-bold text-base tracking-tight">
            Crowd<span className="text-cyan-400">Sense</span> AI
          </span>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
        <AlertToast />
      </div>
    </div>
  );
}
