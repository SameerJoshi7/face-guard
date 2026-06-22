import { defineConfig } from 'vite';

export default defineConfig({
  base: '/face-guard/',
  // Ensure MediaPipe WASM files are served correctly
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision'],
  },
  server: {
    port: 5173,
    // Expose on local network so phones/tablets on same WiFi can access:
    //   http://<your-laptop-ip>:5173
    // Find your IP: run `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
    host: true,

    // ── HTTPS (required for camera on non-localhost devices) ────────────────
    // By default, Chrome allows camera on localhost without HTTPS.
    // But when opening from a phone via IP address, Chrome REQUIRES HTTPS.
    // Uncomment the lines below to enable self-signed HTTPS:
    //
    // https: true,
    //
    // After enabling, visit: https://<your-laptop-ip>:5173
    // Chrome will show a security warning — click "Advanced → Proceed" once.
    // After that, camera access works normally.
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});

