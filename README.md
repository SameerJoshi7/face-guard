# 🔒 FaceGuard — Home Security Face Detection System

AI-powered home security that detects faces in real-time using your camera and sends instant photo alerts to your mobile device.

**Zero API keys required.** Runs 100% in-browser.

---

## Features

- 📹 **Live camera feed** with AI bounding box overlay
- 📏 **Proximity detection** — alerts when face is ≤1 foot from camera
- 🔊 **Audio beep alarm** — synthesized via Web Audio API
- 📸 **Face snapshot** — captured and sent with every alert
- 📱 **Mobile push notifications** via [ntfy.sh](https://ntfy.sh) (free, no account)
- 🔒 **Armed / Disarmed toggle** with cooldown control
- 📋 **Alert log** — persisted across sessions with face thumbnails
- 📦 **PWA** — installable on Android as a home screen app

---

## API Keys Required?

| Feature | Requires API Key? |
|---------|-----------------|
| Face Detection (MediaPipe) | ❌ No |
| Camera (getUserMedia) | ❌ Browser permission only |
| Audio Alarm | ❌ No |
| Mobile Push Alerts (ntfy.sh) | ❌ No |
| PWA install on Android | ❌ No |

---

## Getting Started

### 1. Install & Run

```bash
npm install
npm run dev
```

Open **http://localhost:5173** in Chrome or Edge.

### 2. Set Up Mobile Alerts (Phone Notifications)

1. Install the **ntfy** app on your Android phone ([Play Store](https://play.google.com/store/apps/details?id=io.heckel.ntfy))
2. In the FaceGuard app, note the generated **ntfy Topic** (e.g. `faceguard-abc123`)
3. In the ntfy Android app, tap **+** and subscribe to your topic
4. Click **Test Notification** in FaceGuard to verify it works
5. ✅ You'll now receive photo alerts on your phone whenever a face is detected!

### 3. Arm the System

- Click **ARMED** button to arm/disarm
- Use **Sensitivity** slider to adjust trigger distance:
  - **Low** = only triggers at very close range (< 0.5 ft)
  - **Medium** = triggers at ≈ 1 foot (default)
  - **High** = triggers from ≈ 2 feet away
- Use **Alert Cooldown** to control how often alerts fire

---

## Project Structure

```
face-guard/
├── index.html                  # App shell
├── manifest.json               # PWA manifest
├── service-worker.js           # Offline caching + push handler
├── vite.config.js
├── package.json
│
├── src/
│   ├── main.js                 # Bootstrap
│   ├── App.js                  # Root orchestrator
│   ├── config.js               # All constants
│   ├── style.css               # Design system
│   │
│   └── modules/
│       ├── CameraManager.js    # Camera stream management
│       ├── FaceDetector.js     # MediaPipe face detection
│       ├── CanvasOverlay.js    # Bounding box rendering
│       ├── AudioManager.js     # Web Audio beep synthesis
│       ├── AlertManager.js     # Cooldown + snapshot capture
│       ├── Notifier.js         # ntfy.sh + browser notifications
│       └── StorageManager.js   # localStorage alert log
│
└── public/
    └── icons/                  # PWA icons
```

---

## How Distance Is Estimated

No depth sensor is needed. The system estimates proximity by measuring how large the detected face is relative to the frame:

```
proximity_ratio = face_width / frame_width

ratio > 0.35  →  Very Close  (< 0.5 ft)   — RED ALERT
ratio > 0.22  →  Close       (≈ 1 ft)     — RED ALERT  ← default trigger
ratio > 0.10  →  Medium      (1–3 ft)     — AMBER
ratio ≤ 0.10  →  Far         (> 3 ft)     — GREEN
```

Adjust via the **Sensitivity** slider in the UI.

---

## Install as Android App (PWA)

1. Open the app in Chrome on your Android phone (must be on same WiFi as laptop, or deployed)
2. Tap the browser menu → **Add to Home Screen**
3. Launch from home screen — it runs like a native app with full camera + notification access

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Face Detection | MediaPipe BlazeFace (short-range, in-browser WASM) |
| Camera | Web `getUserMedia` API |
| Audio | Web Audio API (synthesized tones) |
| Push Alerts | ntfy.sh HTTP relay — no account needed |
| Browser Alerts | Web Notifications API |
| PWA | Service Worker + Web App Manifest |
| Build Tool | Vite 5 |
