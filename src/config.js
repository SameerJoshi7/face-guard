/**
 * @file config.js
 * @description Central configuration for FaceGuard.
 * All tunable constants live here — never scatter magic numbers in modules.
 */

/** @readonly */
export const CONFIG = Object.freeze({

  /** Face detection thresholds */
  detection: {
    /** MediaPipe minimum confidence score to accept a detection (0–1) */
    confidenceThreshold: 0.65,

    /**
     * Proximity thresholds (person bounding-box width ÷ frame width).
     * Calibrated for a typical 1080p webcam at normal FoV:
     *   ratio > 0.45  → very close  (< ~1.5 ft)
     *   ratio > 0.25  → close       (1.5–3 ft)
     *   ratio > 0.12  → medium      (3–6 ft)
     *   ratio ≤ 0.12  → far         (> 6 ft)
     */
    proximity: {
      alert: 0.25,   // triggers alarm
      medium: 0.12,  // shows yellow warning
    },

    /** Minimum ms between consecutive alerts (cooldown) — user-adjustable */
    defaultCooldownMs: 30_000,

    /** Capture interval during an active session (ms) */
    sessionCaptureIntervalMs: 10_000,

    /** Duration of no person detection before ending a session (ms) */
    sessionExitGracePeriodMs: 5_000,

    /** Detection loop interval in ms (lower = more CPU, higher = less responsive) */
    scanIntervalMs: 150,
  },

  /** Web Audio API alarm settings */
  audio: {
    beepFrequency: 880,       // Hz — A5 note
    beepDurationSec: 0.18,    // duration of one beep
    beepCount: 4,             // number of beeps per alert
    beepIntervalMs: 220,      // ms between beeps
    waveType: 'square',       // oscillator type: sine | square | sawtooth | triangle
    gainLevel: 0.4,           // volume (0–1)
  },

  /** Camera / video constraints */
  camera: {
    preferredWidth: 1280,
    preferredHeight: 720,
    frameRate: 30,
  },

  /** ntfy.sh notification relay — no API key required */
  notifications: {
    ntfyBaseUrl: 'https://ntfy.sh',
    /** Default topic; user should replace with their own unique string */
    defaultTopic: `faceguard-${Math.random().toString(36).slice(2, 8)}`,
    /** JPEG quality for snapshot sent to ntfy (0–1) */
    snapshotQuality: 0.82,
    /** Max px dimension for snapshot (to keep payload small) */
    snapshotMaxDimension: 640,
  },

  /** Local alert log */
  storage: {
    storageKey: 'faceguard_alerts_v1',
    maxLogEntries: 50,
  },

});
