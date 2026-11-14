import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './routes/router.jsx';
import { useAuthStore } from './store/useAuthStore.js';
import { useUiLanguageSync } from './hooks/useUiLanguageSync.js';

/**
 * Le routeur gère désormais lui-même la distinction public/protégé
 * (voir router.jsx + RequireAuth.jsx) : /login et /invite/:token
 * restent atteignables sans session, ce qu'un simple "if (!user)"
 * ici rendait impossible.
 */
export default function App() {
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  useUiLanguageSync();

  return (
    // useTransitions={false} : les changements de page sont appliqués
    // immédiatement. Avec les transitions React (comportement par défaut de
    // React Router 7), quitter la page Statistiques restait bloqué : l'adresse
    // changeait mais l'ancienne page restait affichée jusqu'au rechargement.
    <RouterProvider router={router} useTransitions={false} />
  );
}
