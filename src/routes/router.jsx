import { createBrowserRouter, Navigate } from 'react-router-dom';
import RouteError from '../components/ui/RouteError.jsx';

const RELOAD_FLAG = 'am-chunk-reload';

/**
 * Page chargée à la demande, par le routeur lui-même (propriété `lazy`
 * des routes) : pendant le téléchargement, la navigation est "en cours"
 * (barre de progression dans AppShell) puis la page s'affiche.
 *
 * Après un déploiement, un onglet resté ouvert connaît encore les anciens
 * noms de fichiers : le téléchargement de la page échoue, l'adresse change
 * mais rien ne s'affiche. Dans ce cas on recharge la page une fois —
 * l'adresse étant déjà la bonne, on arrive directement sur la page voulue
 * avec la nouvelle version. Le drapeau en sessionStorage évite de
 * recharger en boucle si l'échec a une autre cause (réseau coupé) : la
 * seconde fois, l'erreur est affichée par RouteError.
 */
function page(load) {
  return async () => {
    try {
      const module = await load();
      try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* stockage indisponible */ }
      return { Component: module.default };
    } catch (err) {
      let alreadyReloaded = true;
      try {
        alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === '1';
        if (!alreadyReloaded) sessionStorage.setItem(RELOAD_FLAG, '1');
      } catch { /* stockage indisponible : on n'insiste pas */ }
      if (!alreadyReloaded) {
        window.location.reload();
        return new Promise(() => {}); // la page se recharge : rien à afficher d'ici là
      }
      throw err;
    }
  };
}
import AppShell from '../components/layout/AppShell.jsx';
import RequireAuth from './RequireAuth.jsx';
import LoginPage from '../features/auth/LoginPage.jsx';
import InviteAcceptPage from '../features/auth/InviteAcceptPage.jsx';
import Dashboard from '../features/dashboard/Dashboard.jsx';
const ImportExportPage = page(() => import('../features/export/ImportExportPage.jsx'));
const IndividualsList = page(() => import('../features/individual/IndividualsList.jsx'));
const IndividualDetailView = page(() => import('../features/individual/IndividualDetailView.jsx'));
const FamilyTreeContainer = page(() => import('../features/tree/FamilyTreeContainer.jsx'));
const SourcesManager = page(() => import('../features/sources/SourcesManager.jsx'));
const WorldMapView = page(() => import('../features/map/WorldMapView.jsx'));
const PhotosGallery = page(() => import('../features/media/PhotosGallery.jsx'));
const PetsManager = page(() => import('../features/pets/PetsManager.jsx'));
const StatisticsPage = page(() => import('../features/stats/StatisticsPage.jsx'));
const AuditPage = page(() => import('../features/stats/AuditPage.jsx'));
const UnionReviewPage = page(() => import('../features/stats/UnionReviewPage.jsx'));
const SettingsPage = page(() => import('../features/settings/SettingsPage.jsx'));

export const router = createBrowserRouter([
  // Les pages sont chargées à la demande (voir page() ci-dessus) : la carte, les PDF ou les
  // graphiques ne sont téléchargés que lorsqu'on ouvre la page qui s'en sert.
  // Routes publiques : atteignables sans session (voir RequireAuth.jsx).
  { path: '/login', element: <LoginPage /> },
  { path: '/invite/:token', element: <InviteAcceptPage /> },

  // Routes protégées : RequireAuth redirige vers /login si non connecté.
  {
    path: '/',
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppShell />,
        // Une erreur dans une page s'affiche à la place de la page, sans
        // faire disparaître le menu ni le reste de l'application.
        errorElement: <RouteError />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: 'import', lazy: ImportExportPage },
          { path: 'individus', lazy: IndividualsList },
          { path: 'individus/:id', lazy: IndividualDetailView },
          { path: 'arbre', lazy: FamilyTreeContainer },
          { path: 'carte', lazy: WorldMapView },
          { path: 'sources', lazy: SourcesManager },
          { path: 'photos', lazy: PhotosGallery },
          { path: 'animaux', lazy: PetsManager },
          { path: 'statistiques', lazy: StatisticsPage },
          { path: 'audit', lazy: AuditPage },
          { path: 'unions', lazy: UnionReviewPage },
          { path: 'parametres', lazy: SettingsPage },
          { path: 'parametres/:tab', lazy: SettingsPage },
        ],
      },
    ],
  },

  { path: '*', element: <Navigate to="/" replace /> },
], {
  // BASE_URL vaut "/" (Cloudflare Pages) ou "/arbre-memoire/" (GitHub Pages)
  // selon la configuration Vite (voir vite.config.js) : toutes les routes
  // ci-dessus restent écrites sans ce préfixe, React Router l'ajoute/l'enlève
  // lui-même partout (liens, redirections, lecture de l'URL).
  basename: import.meta.env.BASE_URL,
});
