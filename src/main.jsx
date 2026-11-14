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
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // L'absence de service worker ne doit jamais empêcher l'app de fonctionner.
    });
  });
}
