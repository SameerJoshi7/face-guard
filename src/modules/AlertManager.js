/**
 * @file AlertManager.js
 * @description State-machine driven alert pipeline: manages person detection sessions,
 * captures continuous snapshots at regular intervals during active sessions,
 * and handles cooldown periods.
 *
 * Emits custom events on window:
 *   - 'faceguard:session-start': { detail: { snapshot: Blob, entry: AlertEntry } }
 *   - 'faceguard:session-update': { detail: { snapshot: Blob, entry: AlertEntry, photoNum: number } }
 *   - 'faceguard:session-end': { detail: { durationSec: number, totalPhotos: number } }
 */

import { CONFIG } from '../config.js';
import { StorageManager } from './StorageManager.js';

export class AlertManager {
  /** @type {StorageManager} */
  #storage;

  /** @type {number} Timestamp of last ended session (ms) */
  #lastSessionEndTime = 0;

  /** @type {number} Cooldown duration in ms (user-adjustable) */
  #cooldownMs;

  /** @type {boolean} */
  #armed = true;

  /** @type {number} Default sensitivity level (1=Low, 2=Medium, 3=High) */
  #sensitivityLevel = 2;

  /**
   * @typedef {Object} IntrusionSession
   * @property {string} id
   * @property {number} startTime
   * @property {number} lastSeenTime
   * @property {number} photoCount
   * @property {number} lastCaptureTime
   */

  /** @type {IntrusionSession|null} */
  #currentSession = null;

  /**
   * @param {StorageManager} storage
   */
  constructor(storage) {
    this.#storage = storage;
    this.#cooldownMs = CONFIG.detection.defaultCooldownMs;
  }

  /**
   * Evaluates person detections and runs the session state machine.
   *
   * @param {import('./PersonDetector.js').PersonDetection[]} detections
   * @param {HTMLVideoElement} videoEl
   * @param {HTMLCanvasElement} canvas
   */
  async evaluate(detections, videoEl, canvas) {
    if (!this.#armed) return;

    // Filter detections to get the closest qualified intrusion
    const qualifiedDetections = detections.filter(d => this.#isQualifiedIntrusion(d));
    const hasIntruder = qualifiedDetections.length > 0;

    if (hasIntruder) {
      const bestDetection = qualifiedDetections.reduce((a, b) =>
        a.proximityRatio > b.proximityRatio ? a : b
      );

      if (!this.#currentSession) {
        // Enforce cooldown between sessions
        if (Date.now() - this.#lastSessionEndTime < this.#cooldownMs) {
          return;
        }

        // Start new session
        this.#currentSession = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          startTime: Date.now(),
          lastSeenTime: Date.now(),
          photoCount: 1,
          lastCaptureTime: Date.now(),
        };

        const snapshot = await this.#captureSnapshot(videoEl, canvas, bestDetection);

        const entry = await this.#storage.saveAlert({
          timestamp: Date.now(),
          snapshotBlob: snapshot.blob,
          proximity: bestDetection.proximity,
          score: bestDetection.score,
        });

        window.dispatchEvent(
          new CustomEvent('faceguard:session-start', {
            detail: { snapshot: snapshot.blob, entry },
          })
        );
      } else {
        // Update active session last seen time
        this.#currentSession.lastSeenTime = Date.now();

        // Check if it's time to capture another photo in the burst sequence
        const timeSinceLastCapture = Date.now() - this.#currentSession.lastCaptureTime;
        if (timeSinceLastCapture >= CONFIG.detection.sessionCaptureIntervalMs) {
          this.#currentSession.photoCount += 1;
          this.#currentSession.lastCaptureTime = Date.now();

          const snapshot = await this.#captureSnapshot(videoEl, canvas, bestDetection);

          const entry = await this.#storage.saveAlert({
            timestamp: Date.now(),
            snapshotBlob: snapshot.blob,
            proximity: bestDetection.proximity,
            score: bestDetection.score,
          });

          window.dispatchEvent(
            new CustomEvent('faceguard:session-update', {
              detail: {
                snapshot: snapshot.blob,
                entry,
                photoNum: this.#currentSession.photoCount
              },
            })
          );
        }
      }
    } else {
      // No intruder seen this frame. If in an active session, check if grace period elapsed
      if (this.#currentSession) {
        const timeSinceLastSeen = Date.now() - this.#currentSession.lastSeenTime;
        if (timeSinceLastSeen >= CONFIG.detection.sessionExitGracePeriodMs) {
          // Grace period elapsed -> End session
          const durationSec = Math.round((Date.now() - this.#currentSession.startTime) / 1000);
          const totalPhotos = this.#currentSession.photoCount;

          this.#currentSession = null;
          this.#lastSessionEndTime = Date.now();

          window.dispatchEvent(
            new CustomEvent('faceguard:session-end', {
              detail: { durationSec, totalPhotos },
            })
          );
        }
      }
    }
  }

  /**
   * Helper to determine if a person detection qualifies as an alert-triggering intrusion.
   *
   * @param {import('./PersonDetector.js').PersonDetection} det
   * @returns {boolean}
   */
  #isQualifiedIntrusion(det) {
    if (det.score < CONFIG.detection.confidenceThreshold) return false;

    // Sensitivity maps:
    // 1 (Low): only 'close' or 'very-close' (large presence)
    // 2 (Medium): 'medium', 'close', or 'very-close'
    // 3 (High): any presence ('far', 'medium', etc.)
    if (this.#sensitivityLevel === 1) {
      return det.proximity === 'close' || det.proximity === 'very-close';
    } else if (this.#sensitivityLevel === 2) {
      return det.proximity === 'medium' || det.proximity === 'close' || det.proximity === 'very-close';
    }
    return true; // High sensitivity triggers on all
  }

  /**
   * Captures a JPEG snapshot of the current video frame.
   */
  async #captureSnapshot(videoEl, _canvas, detection) {
    const maxDim = CONFIG.notifications.snapshotMaxDimension;
    const quality = CONFIG.notifications.snapshotQuality;

    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;

    // Add 40% padding around the person for context
    const padX = detection.boundingBox.width * 0.4;
    const padY = detection.boundingBox.height * 0.4;
    const sx = Math.max(0, detection.boundingBox.originX - padX);
    const sy = Math.max(0, detection.boundingBox.originY - padY);
    const sw = Math.min(vw - sx, detection.boundingBox.width + padX * 2);
    const sh = Math.min(vh - sy, detection.boundingBox.height + padY * 2);

    const scale = Math.min(1, maxDim / Math.max(sw, sh));
    const dw = Math.round(sw * scale);
    const dh = Math.round(sh * scale);

    const offscreen = new OffscreenCanvas(dw, dh);
    const ctx = offscreen.getContext('2d');
    ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, dw, dh);

    const blob = await offscreen.convertToBlob({ type: 'image/jpeg', quality });
    const dataUrl = await this.#blobToDataUrl(blob);

    return { blob, dataUrl };
  }

  /**
   * Helper to convert a blob to base64 data URL.
   */
  #blobToDataUrl(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Checks if starting a new session is currently in cooldown.
   * @returns {boolean}
   */
  #isInCooldown() {
    return Date.now() - this.#lastSessionEndTime < this.#cooldownMs;
  }

  /**
   * Getter for active session status.
   * @returns {boolean}
   */
  get isSessionActive() {
    return this.#currentSession !== null;
  }

  /**
   * Getter for current active session photo count.
   * @returns {number}
   */
  get sessionPhotoCount() {
    return this.#currentSession ? this.#currentSession.photoCount : 0;
  }

  /**
   * Returns remaining cooldown time in ms, or 0 if not in cooldown.
   * @returns {number}
   */
  get remainingCooldownMs() {
    const remaining = this.#cooldownMs - (Date.now() - this.#lastSessionEndTime);
    return Math.max(0, remaining);
  }

  /** @param {boolean} value */
  set armed(value) {
    this.#armed = value;
    if (!value) {
      // Disarming immediately ends any active session
      this.#currentSession = null;
    }
  }

  /** @returns {boolean} */
  get armed() {
    return this.#armed;
  }

  /** @param {number} ms */
  set cooldownMs(ms) {
    this.#cooldownMs = ms;
  }

  /** @param {number} level */
  set sensitivityLevel(level) {
    this.#sensitivityLevel = level;
  }

  /** @returns {number} */
  get sensitivityLevel() {
    return this.#sensitivityLevel;
  }
}
