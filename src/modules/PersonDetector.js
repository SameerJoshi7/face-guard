/**
 * @file PersonDetector.js
 * @description Detects humans in a video frame using MediaPipe Object Detector.
 * Unlike face detection, this works from ANY angle (front, side, back)
 * and at ANY distance — no proximity threshold needed.
 *
 * Uses the EfficientDet Lite0 model filtered to the "person" category only.
 * No API key required — runs 100% in-browser via WASM.
 */

import { ObjectDetector, FilesetResolver } from '@mediapipe/tasks-vision';

/**
 * @typedef {Object} PersonDetection
 * @property {{ originX: number, originY: number, width: number, height: number }} boundingBox
 * @property {number} score  - Confidence 0–1
 * @property {number} area   - Fraction of frame area occupied (0–1)
 */

export class PersonDetector {
  /** @type {ObjectDetector|null} */
  #detector = null;

  /** @type {boolean} */
  #initialized = false;

  /**
   * Loads the EfficientDet Lite0 object detection model.
   * Filters to "person" category only for efficiency.
   * @param {function(string): void} [onProgress]
   * @returns {Promise<void>}
   */
  async initialize(onProgress) {
    if (this.#initialized) return;

    onProgress?.('Loading AI runtime...');

    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
    );

    onProgress?.('Loading person detection model...');

    this.#detector = await ObjectDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      scoreThreshold: 0.45,
      categoryAllowlist: ['person'],
      maxResults: 5,
    });

    this.#initialized = true;
    onProgress?.('Model ready');
  }

  /**
   * Detects all persons in the current video frame.
   * Works for any orientation — front, back, side view.
   *
   * @param {HTMLVideoElement} videoEl
   * @returns {PersonDetection[]}
   */
  detect(videoEl) {
    if (!this.#initialized || !this.#detector) return [];
    if (videoEl.readyState < 2) return [];

    const results = this.#detector.detectForVideo(videoEl, performance.now());
    const frameWidth = videoEl.videoWidth || 1;
    const frameArea = frameWidth * (videoEl.videoHeight || 1);

    return (results.detections ?? []).map((det) => {
      const bb = det.boundingBox;
      const ratio = bb.width / frameWidth;

      let proximity = 'far';
      if (ratio > 0.45) proximity = 'very-close';
      else if (ratio > 0.25) proximity = 'close';
      else if (ratio > 0.12) proximity = 'medium';

      return {
        boundingBox: {
          originX: bb.originX,
          originY: bb.originY,
          width:   bb.width,
          height:  bb.height,
        },
        score: det.categories?.[0]?.score ?? 0,
        proximityRatio: ratio,
        proximity,
        area:  (bb.width * bb.height) / frameArea,
      };
    });
  }

  /** @returns {boolean} */
  get isReady() { return this.#initialized; }

  dispose() {
    this.#detector?.close();
    this.#detector = null;
    this.#initialized = false;
  }
}
