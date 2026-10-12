import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../components/auth/AuthLayout';
import AuthCard from '../components/auth/AuthCard';
import AuthInput from '../components/auth/AuthInput';
import { useAuth } from '../context/AuthContext';

interface FormErrors {
  nombre?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  general?: string;
}

function validate(
  nombre: string,
  email: string,
  password: string,
  confirmPassword: string
): FormErrors {
  const errors: FormErrors = {};

  if (!nombre.trim()) {
    errors.nombre = 'El nombre completo es requerido.';
  } else if (nombre.trim().length < 2) {
    errors.nombre = 'El nombre debe tener al menos 2 caracteres.';
  }

  if (!email.trim()) {
    errors.email = 'El correo electrónico es requerido.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Ingresa un correo electrónico válido.';
  }

  if (!password) {
    errors.password = 'La contraseña es requerida.';
  } else if (password.length < 6) {
    errors.password = 'La contraseña debe tener al menos 6 caracteres.';
  }

  if (!confirmPassword) {
    errors.confirmPassword = 'Debes confirmar tu contraseña.';
  } else if (confirmPassword !== password) {
    errors.confirmPassword = 'Las contraseñas no coinciden.';
  }

  return errors;
}

export default function RegisterPage() {
  const { register } = useAuth();

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registrado, setRegistrado] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validation = validate(nombre, email, password, confirmPassword);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }
    setErrors({});
    setIsSubmitting(true);
    try {
      await register({ nombre: nombre.trim(), email: email.trim(), password });
      setRegistrado(true);
    } catch (err) {
      setErrors({
        general: err instanceof Error ? err.message : 'Error al crear la cuenta.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <AuthCard>
        {/* Encabezado */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#0F172A]">Crear cuenta</h1>
          <p className="text-sm text-slate-600 mt-1">
            Regístrate para acceder al sistema de monitoreo.
          </p>
        </div>

        {/* Nota de rol — importante, siempre visible */}
        <div className="mb-5 px-4 py-3 rounded-lg bg-blue-50 border border-blue-200 flex items-start gap-2.5">
          <span className="text-blue-600 mt-0.5 shrink-0 text-base" aria-hidden="true">ℹ️</span>
          <p className="text-xs text-blue-700 leading-relaxed">
            Las cuentas nuevas se registran como{' '}
            <strong>vigilante</strong>. Las cuentas administradoras son
            gestionadas internamente por el equipo de seguridad.
          </p>
        </div>

        {/* Error general */}
        {errors.general && (
          <div
            role="alert"
            className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
          >
            {errors.general}
          </div>
        )}

        {registrado && (
          <div
            role="status"
            className="mb-4 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800"
          >
            Cuenta creada. Un administrador debe activarla antes de que puedas
            iniciar sesión.
          </div>
        )}

        {!registrado && (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <AuthInput
            id="nombre"
            label="Nombre completo"
            type="text"
            autoComplete="name"
            placeholder="Juan Pérez"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            error={errors.nombre}
            disabled={isSubmitting}
          />

          <AuthInput
            id="email"
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            disabled={isSubmitting}
          />

          <AuthInput
            id="password"
            label="Contraseña"
            type="password"
            showToggle
            autoComplete="new-password"
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            disabled={isSubmitting}
          />

          <AuthInput
            id="confirmPassword"
            label="Confirmar contraseña"
            type="password"
            showToggle
            autoComplete="new-password"
            placeholder="Repite tu contraseña"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={errors.confirmPassword}
            disabled={isSubmitting}
          />

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 w-full py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </form>
        )}

        <p className="mt-6 text-center text-sm text-slate-600">
          ¿Ya tienes cuenta?{' '}
          <Link
            to="/login"
            className="text-[#2563EB] font-medium hover:text-blue-800 transition-colors"
          >
            Inicia sesión
          </Link>
        </p>
      </AuthCard>
    </AuthLayout>
  );
}
