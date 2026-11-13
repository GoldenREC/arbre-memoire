import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppShell from '../components/layout/AppShell.jsx';
import RequireAuth from './RequireAuth.jsx';
import LoginPage from '../features/auth/LoginPage.jsx';
import InviteAcceptPage from '../features/auth/InviteAcceptPage.jsx';
import Dashboard from '../features/dashboard/Dashboard.jsx';
import ImportExportPage from '../features/export/ImportExportPage.jsx';
import IndividualsList from '../features/individual/IndividualsList.jsx';
import IndividualDetailView from '../features/individual/IndividualDetailView.jsx';
import FamilyTreeContainer from '../features/tree/FamilyTreeContainer.jsx';
import SourcesManager from '../features/sources/SourcesManager.jsx';
import WorldMapView from '../features/map/WorldMapView.jsx';
import PhotosGallery from '../features/media/PhotosGallery.jsx';
import PetsManager from '../features/pets/PetsManager.jsx';
import StatisticsPage from '../features/stats/StatisticsPage.jsx';
import AuditPage from '../features/stats/AuditPage.jsx';
import SettingsPage from '../features/settings/SettingsPage.jsx';

export const router = createBrowserRouter([
  // Routes publiques : atteignables sans session (voir RequireAuth.jsx).
  { path: '/login', element: <LoginPage /> },
  { path: '/invite/:token', element: <InviteAcceptPage /> },

  // Routes protégées : RequireAuth redirige vers /login si non connecté.
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
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
          { path: 'parametres', element: <SettingsPage /> },
          { path: 'parametres/:tab', element: <SettingsPage /> },
        ],
      },
    ],
  },

  { path: '*', element: <Navigate to="/" replace /> },
]);
