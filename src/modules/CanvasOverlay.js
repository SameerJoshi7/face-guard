/**
 * @file CanvasOverlay.js
 * @description Renders face detection bounding boxes on a <canvas> element
 * positioned over the live camera feed. Color-codes by proximity level.
 */

/** @type {Record<string, string>} Proximity level → stroke color */
const PROXIMITY_COLORS = {
  'very-close': '#ff3333',  // red — alert
  'close':      '#ff3333',  // red — alert
  'medium':     '#ffb700',  // amber — warning
  'far':        '#00ff41',  // green — safe
};

/** @type {Record<string, string>} Proximity level → label text */
const PROXIMITY_LABELS = {
  'very-close': '⚠ VERY CLOSE',
  'close':      '⚠ CLOSE',
  'medium':     'IN RANGE',
  'far':        'DETECTED',
};

export class CanvasOverlay {
  /** @type {HTMLCanvasElement} */
  #canvas;

  /** @type {CanvasRenderingContext2D} */
  #ctx;

  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext('2d');
  }

  /**
   * Syncs canvas dimensions with the video feed and draws all detections.
   *
   * @param {import('./FaceDetector.js').Detection[]} detections
   * @param {HTMLVideoElement} videoEl - used for dimension sync
   */
  draw(detections, videoEl) {
    this.#syncDimensions(videoEl);
    this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);

    for (const det of detections) {
      this.#drawDetection(det);
    }
  }

  /**
   * Clears the canvas.
   */
  clear() {
    this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
  }

  /**
   * Draws a single detection bounding box with corner accents and label.
   * @param {import('./FaceDetector.js').Detection} det
   */
  #drawDetection(det) {
    const { originX: x, originY: y, width: w, height: h } = det.boundingBox;
    const color = PROXIMITY_COLORS[det.proximity] ?? '#00ff41';
    const label = PROXIMITY_LABELS[det.proximity] ?? 'DETECTED';
    const ctx = this.#ctx;

    // Semi-transparent fill
    ctx.fillStyle = `${color}18`;
    ctx.fillRect(x, y, w, h);

    // Corner accent brackets (instead of a plain rectangle)
    const cs = Math.min(w, h) * 0.2; // corner size
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;

    ctx.beginPath();
    // Top-left
    ctx.moveTo(x, y + cs); ctx.lineTo(x, y); ctx.lineTo(x + cs, y);
    // Top-right
    ctx.moveTo(x + w - cs, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cs);
    // Bottom-right
    ctx.moveTo(x + w, y + h - cs); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - cs, y + h);
    // Bottom-left
    ctx.moveTo(x + cs, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - cs);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Label pill above the box
    const fontSize = Math.max(11, Math.min(14, w * 0.1));
    const text = `${label}  ${Math.round(det.score * 100)}%`;
    ctx.font = `600 ${fontSize}px "JetBrains Mono", monospace`;
    const textMetrics = ctx.measureText(text);
    const pillW = textMetrics.width + 16;
    const pillH = fontSize + 10;
    const pillX = x;
    const pillY = y - pillH - 4;

    // Pill background
    ctx.fillStyle = `${color}cc`;
    this.#roundRect(ctx, pillX, Math.max(2, pillY), pillW, pillH, 4);
    ctx.fill();

    // Pill text
    ctx.fillStyle = '#080c08';
    ctx.fillText(text, pillX + 8, Math.max(pillH, pillY + fontSize + 2));

    // Confidence bar at bottom of bounding box
    const barH = 3;
    ctx.fillStyle = `${color}44`;
    ctx.fillRect(x, y + h + 2, w, barH);
    ctx.fillStyle = color;
    ctx.fillRect(x, y + h + 2, w * det.score, barH);
  }

  /**
   * Syncs canvas size to match the video element's rendered size.
   * @param {HTMLVideoElement} videoEl
   */
  #syncDimensions(videoEl) {
    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    if (this.#canvas.width !== vw || this.#canvas.height !== vh) {
      this.#canvas.width = vw;
      this.#canvas.height = vh;
    }
  }

  /**
   * Draws a rounded rectangle path.
   * @param {CanvasRenderingContext2D} ctx
   */
  #roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
