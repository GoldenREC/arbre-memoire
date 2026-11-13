import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore.js';
import { ROLE_LABELS, getInvitationPreview, acceptInvitation } from '../../lib/db/invitations.js';

/**
 * Page publique /invite/:token — atteignable sans connexion préalable
 * (voir router.jsx / RequireAuth.jsx). Affiche l'aperçu de l'invitation
 * (arbre, rôle proposé) via la RPC publique get_invitation_preview,
 * puis laisse la personne se connecter ou créer un compte, et appelle
 * accept_invitation() dès qu'une session existe pour l'e-mail invité.
 */
export default function InviteAcceptPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading, signInWithPassword, signUp, loadTrees, error: authError } = useAuthStore();

  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(true);

  const [mode, setMode] = useState('signup'); // 'signup' | 'signin'
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const [awaitingEmailConfirmation, setAwaitingEmailConfirmation] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const acceptedOnce = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getInvitationPreview(token);
        if (!cancelled) setPreview(data);
      } catch (err) {
        if (!cancelled) setPreviewError(err.message || "Impossible de charger cette invitation.");
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const invitationUsable = preview && preview.status === 'pending' && !preview.expired;

  // Dès qu'une session existe (connexion directe, inscription avec
  // confirmation immédiate, ou retour du lien de confirmation par
  // e-mail) et que l'invitation est valide, on finalise l'adhésion.
  useEffect(() => {
    if (!user || !invitationUsable || acceptedOnce.current || authLoading) return;
    acceptedOnce.current = true;
    setAccepting(true);
    (async () => {
      try {
        await acceptInvitation(token);
        await loadTrees();
        navigate('/', { replace: true });
      } catch (err) {
        acceptedOnce.current = false;
        setAccepting(false);
        setFormError(err.message || "Impossible de finaliser l'adhésion.");
      }
    })();
  }, [user, invitationUsable, authLoading, token, loadTrees, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      if (mode === 'signup') {
        await signUp(preview.email, password, { emailRedirectTo: window.location.href });
        // Si la confirmation par e-mail est activée côté projet
        // Supabase, aucune session n'est ouverte immédiatement : on
        // le signale, et l'effet ci-dessus prendra le relais au retour
        // du lien de confirmation (même URL /invite/:token).
        setAwaitingEmailConfirmation(true);
      } else {
        await signInWithPassword(preview.email, password);
      }
    } catch (err) {
      setFormError(err.message || authError || 'Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  }

  const roleLabel = preview?.role ? ROLE_LABELS[preview.role] || preview.role : null;

  return (
    <div className="flex h-screen items-center justify-center bg-neutral-50 p-4 dark:bg-neutral-950">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-6 text-center">
          <div className="mb-2 text-3xl">🌿</div>
          <h1 className="text-lg font-semibold">Arbre & Mémoire</h1>
        </div>

        {previewLoading && <p className="text-center text-sm text-neutral-500">Vérification de l'invitation…</p>}

        {!previewLoading && previewError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-300">{previewError}</p>
        )}

        {!previewLoading && !previewError && preview && preview.status === 'accepted' && (
          <p className="text-center text-sm text-neutral-600 dark:text-neutral-300">
            Cette invitation a déjà été acceptée. <a href="/login" className="text-accent-600 hover:underline">Se connecter</a>
          </p>
        )}
        {!previewLoading && !previewError && preview && preview.status === 'revoked' && (
          <p className="text-center text-sm text-neutral-600 dark:text-neutral-300">Cette invitation a été révoquée par un administrateur de l'arbre.</p>
        )}
        {!previewLoading && !previewError && preview && (preview.expired || preview.status === 'expired') && (
          <p className="text-center text-sm text-neutral-600 dark:text-neutral-300">Cette invitation a expiré. Demande à un administrateur de t'en envoyer une nouvelle.</p>
        )}

        {!previewLoading && !previewError && invitationUsable && (
          <>
            <p className="mb-5 text-center text-sm text-neutral-600 dark:text-neutral-300">
              Tu es invité·e à rejoindre l'arbre <span className="font-medium text-neutral-900 dark:text-white">« {preview.tree_name} »</span> en tant que <span className="font-medium text-neutral-900 dark:text-white">{roleLabel}</span>, avec l'adresse <span className="font-medium">{preview.email}</span>.
            </p>

            {accepting ? (
              <p className="text-center text-sm text-neutral-500">Finalisation de ton adhésion…</p>
            ) : awaitingEmailConfirmation ? (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-center text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                Vérifie ta boîte mail : clique sur le lien de confirmation pour finaliser ton adhésion à l'arbre.
              </p>
            ) : user ? (
              <p className="text-center text-sm text-neutral-500">Connecté·e en tant que {user.email}…</p>
            ) : (
              <>
                <div className="mb-3 flex gap-2 text-xs">
                  <button onClick={() => setMode('signup')} className={`flex-1 rounded-lg px-2.5 py-1.5 font-medium ${mode === 'signup' ? 'bg-accent-600 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}>
                    Créer mon compte
                  </button>
                  <button onClick={() => setMode('signin')} className={`flex-1 rounded-lg px-2.5 py-1.5 font-medium ${mode === 'signin' ? 'bg-accent-600 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}>
                    J'ai déjà un compte
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                  <input type="email" disabled value={preview.email} className="w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    autoFocus
                    placeholder="Mot de passe"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-800"
                  />
                  {formError && <p className="text-sm text-red-600">{formError}</p>}
                  <button type="submit" disabled={busy} className="w-full rounded-lg bg-accent-600 px-3 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60">
                    {busy ? 'Un instant…' : mode === 'signup' ? 'Créer le compte et rejoindre l\'arbre' : "Se connecter et rejoindre l'arbre"}
                  </button>
                </form>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
