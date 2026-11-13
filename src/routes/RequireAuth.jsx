import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore.js';

/**
 * Garde d'accès posée au niveau du routeur (et non plus d'un simple
 * "if (!user)" dans App.jsx) afin que des routes publiques comme
 * /login et /invite/:token restent atteignables sans connexion
 * préalable — voir router.jsx.
 */
export default function RequireAuth() {
  const { user, loading } = useAuthStore();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-neutral-400">
        Chargement…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
