import { useAlerts } from '../../context/AlertContext';

export default function AlertToast() {
  const { pendingAlerts, dismissAlert, atenderAlerta } = useAlerts();

  if (pendingAlerts.length === 0) return null;

  const latest = pendingAlerts[pendingAlerts.length - 1];
  const extras = pendingAlerts.length - 1;

  return (
    <div className="fixed top-4 right-4 z-50 w-full max-w-sm pointer-events-none">
      <div className="pointer-events-auto bg-red-600 text-white rounded-xl shadow-2xl border border-red-500/60 p-4">
        <div className="flex items-start gap-3">
          <span className="text-xl shrink-0 mt-0.5" aria-hidden="true">⚠</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm leading-tight">Alerta de aglomeración</p>
            <p className="text-xs text-red-100 mt-1">
              {latest.personas} persona{latest.personas !== 1 ? 's' : ''} detectadas ·{' '}
              {latest.sesion_id !== null
                ? `Sesión #${latest.sesion_id}`
                : latest.camara_nombre ?? 'Reporte automático'}
            </p>
            {extras > 0 && (
              <p className="text-xs text-red-200 mt-0.5">
                +{extras} alerta{extras > 1 ? 's' : ''} adicional{extras > 1 ? 'es' : ''}
              </p>
            )}
          </div>
          <button
            onClick={() => dismissAlert(latest.id)}
            className="shrink-0 text-red-200 hover:text-white transition-colors text-base leading-none"
            aria-label="Cerrar notificación"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            onClick={() => { void atenderAlerta(latest.id); }}
            className="flex-1 bg-white text-red-600 text-xs font-semibold py-1.5 px-3 rounded-lg hover:bg-red-50 transition-colors"
          >
            Marcar como atendida
          </button>
          <button
            onClick={() => dismissAlert(latest.id)}
            className="px-3 py-1.5 rounded-lg border border-red-400/60 text-red-100 text-xs hover:bg-red-500/40 transition-colors"
          >
            Ignorar
          </button>
        </div>
      </div>
    </div>
  );
}
