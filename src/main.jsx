import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './i18n/index.js';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// PWA : enregistrement du service worker en production uniquement (jamais en
// développement, pour ne pas mettre en cache des builds locaux changeants).
// Le chemin part de import.meta.env.BASE_URL (et non de "/" en dur) pour
// fonctionner aussi bien à la racine (Cloudflare Pages) que sous un
// sous-dossier (GitHub Pages, ex. /arbre-memoire/sw.js) — ce qui donne aussi
// au service worker la bonne portée (scope) dans les deux cas.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // L'absence de service worker ne doit jamais empêcher l'app de fonctionner.
    });
  });
}
