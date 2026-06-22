/**
 * @file main.js
 * @description Application entry point.
 * Registers the service worker and boots the App.
 */

import './style.css';
import { App } from './App.js';

// Register Service Worker for PWA + offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((reg) => console.info('[SW] Registered:', reg.scope))
      .catch((err) => console.warn('[SW] Registration failed:', err));
  });
}

// Mount the application
const app = new App();
app.init().catch((err) => {
  console.error('[main] Fatal error during init:', err);
});
