import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { loginWithGoogle, loginWithMicrosoft, isAuthenticated, validateCurrentSession } from '../services/authService';
import { supabase } from '../services/supabaseClient';

// --- Login Rate Limiting ---
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 2 * 60 * 1000; // 2 minutes
const STORAGE_KEY = 'hd_login_attempts';

interface LoginAttemptData {
  count: number;
  lockedUntil: number | null;
}

const getLoginAttempts = (): LoginAttemptData => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { }
  return { count: 0, lockedUntil: null };
};

const recordLoginAttempt = (): LoginAttemptData => {
  const data = getLoginAttempts();
  data.count++;
  if (data.count >= MAX_LOGIN_ATTEMPTS) {
    data.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  return data;
};

const resetLoginAttempts = () => {
  localStorage.removeItem(STORAGE_KEY);
};

const isLockedOut = (): { locked: boolean; remainingSeconds: number } => {
  const data = getLoginAttempts();
  if (data.lockedUntil && Date.now() < data.lockedUntil) {
    return { locked: true, remainingSeconds: Math.ceil((data.lockedUntil - Date.now()) / 1000) };
  }
  // Reset if lockout expired
  if (data.lockedUntil && Date.now() >= data.lockedUntil) {
    resetLoginAttempts();
  }
  return { locked: false, remainingSeconds: 0 };
};
// --- End Rate Limiting ---

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  const [validating, setValidating] = useState(false);
  const [lockoutTimer, setLockoutTimer] = useState(0);

  // Update lockout timer every second
  useEffect(() => {
    const interval = setInterval(() => {
      const { locked, remainingSeconds } = isLockedOut();
      if (locked) {
        setLockoutTimer(remainingSeconds);
      } else if (lockoutTimer > 0) {
        setLockoutTimer(0);
        setError('');
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutTimer]);

  useEffect(() => {
    // Check for errors from redirection (e.g. from LandingPage)
    if (location.state?.errorMessage) {
      setError(location.state.errorMessage);
      window.history.replaceState({}, document.title)
    }

    // Also check URL params directly here in case user lands on /login with error
    const params = new URLSearchParams(window.location.search);
    const urlError = params.get('error_description') || params.get('error');
    if (urlError) {
      setError(decodeURIComponent(urlError));
    }

    // 1. Check if already authenticated on mount
    if (isAuthenticated()) {
      navigate('/monitor');
    }

    // 2. Listen for auth state changes (e.g. after OAuth redirect)
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        setValidating(true);
        const { allowed, email } = await validateCurrentSession();
        setValidating(false);

        if (allowed) {
          resetLoginAttempts();
          navigate('/monitor');
        } else {
          const attemptData = recordLoginAttempt();
          if (attemptData.lockedUntil) {
            setError(`Demasiados intentos fallidos. Espera 2 minutos antes de intentar de nuevo.`);
            setLockoutTimer(Math.ceil(LOCKOUT_DURATION_MS / 1000));
          } else {
            const remaining = MAX_LOGIN_ATTEMPTS - attemptData.count;
            setError(`Acceso denegado al correo: "${email || session?.user?.email}". Este correo no está autorizado en la base de datos. ${remaining} intento(s) restante(s).`);
          }
        }
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    // Desactivado temporalmente para pruebas
    /*
    const { locked, remainingSeconds } = isLockedOut();
    if (locked) {
      setError(`Cuenta bloqueada temporalmente. Intenta de nuevo en ${remainingSeconds} segundos.`);
      return;
    }
    */
    setError('');
    setLoading(true);

    // Mapeo de nombre de usuario a email
    const loginEmail = email.toLowerCase() === 'jimmy' ? 'jimmy@healthydreams.com' : email;

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password
      });

      if (authError) {
        setError('Usuario o contraseña incorrectos.');
        recordLoginAttempt();
        return;
      }

      if (data.session) {
        const { allowed } = await validateCurrentSession();
        if (allowed) {
          resetLoginAttempts();
          navigate('/monitor');
        } else {
          setError('Este usuario no tiene permisos de acceso.');
          recordLoginAttempt();
        }
      }
    } catch (err) {
      setError('Error de conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  const isCurrentlyLocked = false; // Forzado a false para pruebas

  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#051024] relative overflow-hidden font-display">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/20 blur-[100px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-600/20 blur-[100px]"></div>
      </div>

      <div className="relative z-10 w-full max-w-md p-8">
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <div className="flex justify-center mb-6">
              <img src="/LOGO2.jpg" alt="Healthy tracking" className="w-40 h-40 rounded-full object-cover shadow-xl border-4 border-white/10" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Bienvenido</h1>
            <p className="text-blue-200 mt-2 text-sm text-center">Inicie sesión para acceder al panel</p>
          </div>

          <form onSubmit={handleEmailLogin} className="flex flex-col gap-4">
            <div>
              <label className="block text-blue-200 text-xs font-bold mb-1 ml-1">Usuario</label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Ingresa tu usuario"
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-blue-200 text-xs font-bold mb-1 ml-1">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading || isCurrentlyLocked}
              className={`w-full py-3.5 mt-2 rounded-xl font-bold text-lg shadow-lg transition-all transform flex items-center justify-center gap-3 ${loading || isCurrentlyLocked
                ? 'bg-blue-600/50 text-white/50 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-500 hover:shadow-xl active:scale-95'
                }`}
            >
              {loading ? 'Iniciando sesión...' : 'Entrar'}
            </button>
          </form>

          {isCurrentlyLocked && (
            <div className="mt-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 animate-fade-in">
              <span className="material-symbols-outlined text-amber-400 text-[20px] mt-0.5">lock_clock</span>
              <div className="flex flex-col">
                <span className="text-amber-200 text-sm font-medium">Cuenta bloqueada temporalmente</span>
                <span className="text-amber-200/80 text-xs mt-0.5">
                  Demasiados intentos fallidos. Puedes intentar de nuevo en <strong>{lockoutTimer}s</strong>
                </span>
              </div>
            </div>
          )}

          {error && !isCurrentlyLocked && (
            <div className="mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 animate-fade-in">
              <span className="material-symbols-outlined text-red-400 text-[20px] mt-0.5">error_circle_rounded</span>
              <div className="flex flex-col">
                <span className="text-red-200 text-sm font-medium">Error de Acceso</span>
                <span className="text-red-200/80 text-xs mt-0.5">{error}</span>
              </div>
            </div>
          )}

          <div className="mt-8 text-center border-t border-white/5 pt-6">
            <p className="text-white/40 text-[10px] uppercase tracking-widest font-bold">Sistema de Gestión Integral</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
