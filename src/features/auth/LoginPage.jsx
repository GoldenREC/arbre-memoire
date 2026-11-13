import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore.js';

export default function LoginPage() {
  const { signInWithPassword, signUp, error, user, loading } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(null);

  // Route publique désormais (voir router.jsx) : si une session existe
  // déjà (ou vient de s'ouvrir), on repart vers la page demandée à
  // l'origine, ou le tableau de bord par défaut.
  useEffect(() => {
    if (!loading && user) {
      navigate(location.state?.from?.pathname || '/', { replace: true });
    }
  }, [loading, user, navigate, location.state]);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setInfo(null);
    try {
      if (mode === 'signin') {
        await signInWithPassword(email, password);
      } else {
        await signUp(email, password);
        setInfo('Compte créé. Vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi.');
      }
    } catch {
      // l'erreur est déjà dans le store (useAuthStore.error)
    } finally {
      setBusy(false);
    }
  }

  if (loading || user) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-neutral-400">
        Chargement…
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-6 text-center">
          <div className="mb-2 text-3xl">🌿</div>
          <h1 className="text-lg font-semibold">Arbre & Mémoire</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {mode === 'signin' ? 'Connecte-toi à ton arbre familial' : 'Crée ton compte administrateur'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            required
            placeholder="Adresse e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-800"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-800"
          />

          {error && <p className="text-sm text-red-600">{error}</p>}
          {info && <p className="text-sm text-emerald-600">{info}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-accent-600 px-3 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
          >
            {busy ? 'Un instant…' : mode === 'signin' ? 'Se connecter' : "Créer le compte"}
          </button>
        </form>

        <button
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          className="mt-4 w-full text-center text-sm text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          {mode === 'signin' ? "Pas encore de compte ? Créer l'arbre" : 'Déjà un compte ? Se connecter'}
        </button>
      </div>
    </div>
  );
}
