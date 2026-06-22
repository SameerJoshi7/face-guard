/**
 * @file FaceDetector.js
 * @description Wraps the MediaPipe Tasks Vision FaceDetector.
 * Handles model loading, single-frame detection, and proximity estimation.
 * No API key required — model runs entirely in-browser via WASM.
 */

import { FaceDetector as MediaPipeFaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import { CONFIG } from '../config.js';

/**
 * @typedef {Object} Detection
 * @property {Object}  boundingBox  - { originX, originY, width, height } in pixels
 * @property {number}  score        - confidence 0–1
 * @property {string}  proximity    - 'far' | 'medium' | 'close' | 'very-close'
 * @property {number}  proximityRatio - face width / frame width (0–1)
 */

export class FaceDetector {
  /** @type {MediaPipeFaceDetector|null} */
  #detector = null;

  /** @type {boolean} */
  #initialized = false;

  /**
   * Loads the MediaPipe short-range face detection model.
   * Must be called once before detect().
   * @param {function(string): void} [onProgress] - Called with status messages
   * @returns {Promise<void>}
   */
  async initialize(onProgress) {
    if (this.#initialized) return;

    onProgress?.('Loading AI runtime...');

    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
    );

    onProgress?.('Loading face detection model...');

    this.#detector = await MediaPipeFaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
        delegate: 'GPU', // falls back to CPU automatically if GPU unavailable
      },
      runningMode: 'VIDEO',
      minDetectionConfidence: CONFIG.detection.confidenceThreshold,
      minSuppressionThreshold: 0.3,
    });

    this.#initialized = true;
    onProgress?.('Model ready');
  }

  /**
   * Runs face detection on a single video frame.
   *
   * @param {HTMLVideoElement} videoEl
   * @returns {Detection[]} Array of detected faces (may be empty)
   */
  detect(videoEl) {
    if (!this.#initialized || !this.#detector) {
      throw new Error('[FaceDetector] Not initialized. Call initialize() first.');
    }

    if (videoEl.readyState < 2) return []; // HAVE_CURRENT_DATA not yet available

    const results = this.#detector.detectForVideo(videoEl, performance.now());
    const frameWidth = videoEl.videoWidth || 1;

    return (results.detections ?? []).map((det) => {
      const bb = det.boundingBox;
      const ratio = bb.width / frameWidth;

      return {
        boundingBox: {
          originX: bb.originX,
          originY: bb.originY,
          width: bb.width,
          height: bb.height,
        },
        score: det.categories?.[0]?.score ?? 0,
        proximityRatio: ratio,
        proximity: this.#classifyProximity(ratio),
      };
    });
  }

  /**
   * Classifies proximity based on bounding box ratio.
   * Thresholds tuned for standard webcam field-of-view.
   *
   * @param {number} ratio - face width / frame width
   * @returns {'very-close'|'close'|'medium'|'far'}
   */
  #classifyProximity(ratio) {
    if (ratio > 0.35)                               return 'very-close';
    if (ratio > CONFIG.detection.proximity.alert)   return 'close';
    if (ratio > CONFIG.detection.proximity.medium)  return 'medium';
    return 'far';
  }

  /** @returns {boolean} */
  get isReady() {
    return this.#initialized;
  }

  /**
   * Releases the underlying model resources.
   */
  dispose() {
    this.#detector?.close();
    this.#detector = null;
    this.#initialized = false;
  }
}
