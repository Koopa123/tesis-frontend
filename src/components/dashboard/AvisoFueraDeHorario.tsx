import { useEffect, useState } from 'react';

// Horario de atención del centro comercial: lunes a sábado de 9:00 a 21:00 y domingos de 9:00 a 14:00.
function dentroDelHorario(d: Date): boolean {
  const minutos = d.getHours() * 60 + d.getMinutes();
  const cierre = d.getDay() === 0 ? 14 * 60 : 21 * 60;
  return minutos >= 9 * 60 && minutos < cierre;
}

// Solo en la laptop del local: desde la web pública no se puede detener el sistema.
function esEquipoLocal(): boolean {
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}

export default function AvisoFueraDeHorario() {
  const [fuera, setFuera] = useState(() => !dentroDelHorario(new Date()));
  const [cerrado, setCerrado] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setFuera(!dentroDelHorario(new Date())), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!esEquipoLocal() || !fuera || cerrado) return null;

  return (
    <div
      role="status"
      className="mx-4 sm:mx-6 lg:mx-8 mt-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <span aria-hidden="true" className="text-base leading-5">⚡</span>
      <p className="flex-1">
        Estás fuera del horario de atención (lunes a sábado de 9:00 a 21:00 y domingos de 9:00 a 14:00).
        Si nadie va a vigilar las cámaras, detén el sistema con <strong>Detener CrowdSense</strong> para
        ahorrar energía.
      </p>
      <button
        onClick={() => setCerrado(true)}
        className="text-amber-700 hover:text-amber-900 font-medium"
        aria-label="Cerrar aviso"
      >
        ✕
      </button>
    </div>
  );
}
