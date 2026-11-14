import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import RouteError from '../components/ui/RouteError.jsx';
import AppShell from '../components/layout/AppShell.jsx';
import RequireAuth from './RequireAuth.jsx';
import LoginPage from '../features/auth/LoginPage.jsx';
import InviteAcceptPage from '../features/auth/InviteAcceptPage.jsx';
import Dashboard from '../features/dashboard/Dashboard.jsx';
const ImportExportPage = lazy(() => import('../features/export/ImportExportPage.jsx'));
const IndividualsList = lazy(() => import('../features/individual/IndividualsList.jsx'));
const IndividualDetailView = lazy(() => import('../features/individual/IndividualDetailView.jsx'));
const FamilyTreeContainer = lazy(() => import('../features/tree/FamilyTreeContainer.jsx'));
const SourcesManager = lazy(() => import('../features/sources/SourcesManager.jsx'));
const WorldMapView = lazy(() => import('../features/map/WorldMapView.jsx'));
const PhotosGallery = lazy(() => import('../features/media/PhotosGallery.jsx'));
const PetsManager = lazy(() => import('../features/pets/PetsManager.jsx'));
const StatisticsPage = lazy(() => import('../features/stats/StatisticsPage.jsx'));
const AuditPage = lazy(() => import('../features/stats/AuditPage.jsx'));
const UnionReviewPage = lazy(() => import('../features/stats/UnionReviewPage.jsx'));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage.jsx'));

export const router = createBrowserRouter([
  // Les pages sont chargées à la demande (lazy) : la carte, les PDF ou les
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
          { path: 'import', element: <ImportExportPage /> },
          { path: 'individus', element: <IndividualsList /> },
          { path: 'individus/:id', element: <IndividualDetailView /> },
          { path: 'arbre', element: <FamilyTreeContainer /> },
          { path: 'carte', element: <WorldMapView /> },
          { path: 'sources', element: <SourcesManager /> },
          { path: 'photos', element: <PhotosGallery /> },
          { path: 'animaux', element: <PetsManager /> },
          { path: 'statistiques', element: <StatisticsPage /> },
          { path: 'audit', element: <AuditPage /> },
          { path: 'unions', element: <UnionReviewPage /> },
          { path: 'parametres', element: <SettingsPage /> },
          { path: 'parametres/:tab', element: <SettingsPage /> },
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
