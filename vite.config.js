import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Déployé à deux endroits avec deux chemins différents :
// - Cloudflare Pages (arbre-memoire.pages.dev) : à la racine du domaine.
// - GitHub Pages (goldenrec.github.io/arbre-memoire) : sous un sous-dossier.
// VITE_BASE_PATH n'est défini que par le workflow GitHub Actions ; sans lui,
// le comportement (et donc Cloudflare Pages) ne change pas.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    port: 5173,
  },
});
