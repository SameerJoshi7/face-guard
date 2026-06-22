/**
 * @file CameraManager.js
 * @description Manages the camera stream lifecycle using the getUserMedia Web API.
 * Handles device enumeration, stream start/stop, and camera switching.
 */

export class CameraManager {
  /** @type {MediaStream|null} */
  #stream = null;

  /** @type {HTMLVideoElement} */
  #videoEl;

  /** @type {string|null} */
  #activeDeviceId = null;

  /**
   * @param {HTMLVideoElement} videoElement
   */
  constructor(videoElement) {
    this.#videoEl = videoElement;
  }

  /**
   * Enumerates available video input devices.
   * @returns {Promise<MediaDeviceInfo[]>}
   */
  async getAvailableCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === 'videoinput');
    } catch (err) {
      console.error('[CameraManager] Failed to enumerate devices:', err);
      return [];
    }
  }

  /**
   * Starts the camera stream and attaches it to the video element.
   * Prefers the specified deviceId; falls back to any available camera.
   *
   * @param {object}  [options]
   * @param {string}  [options.deviceId]        - Specific camera device ID
   * @param {number}  [options.width=1280]
   * @param {number}  [options.height=720]
   * @param {number}  [options.frameRate=30]
   * @returns {Promise<void>}
   */
  async start({ deviceId = null, width = 1280, height = 720, frameRate = 30 } = {}) {
    // Stop any existing stream cleanly before starting a new one
    this.stop();

    /** @type {MediaStreamConstraints} */
    const constraints = {
      video: {
        width: { ideal: width },
        height: { ideal: height },
        frameRate: { ideal: frameRate },
        ...(deviceId
          ? { deviceId: { exact: deviceId } }
          : { facingMode: { ideal: 'user' } }),
      },
      audio: false,
    };

    try {
      this.#stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.#videoEl.srcObject = this.#stream;
      this.#activeDeviceId = deviceId;

      // Wait for the video metadata to load so width/height are available
      await new Promise((resolve) => {
        this.#videoEl.onloadedmetadata = resolve;
      });

      await this.#videoEl.play();
    } catch (err) {
      this.#stream = null;
      throw new Error(`[CameraManager] Camera access failed: ${err.message}`);
    }
  }

  /**
   * Stops the active camera stream and clears the video element.
   */
  stop() {
    if (this.#stream) {
      this.#stream.getTracks().forEach((track) => track.stop());
      this.#stream = null;
    }
    this.#videoEl.srcObject = null;
    this.#activeDeviceId = null;
  }

  /**
   * Switches to a different camera device without restarting the whole pipeline.
   * @param {string} deviceId
   * @param {object} opts - Same as start() options
   */
  async switchCamera(deviceId, opts = {}) {
    await this.start({ deviceId, ...opts });
  }

  /** @returns {string|null} The active device ID */
  get activeDeviceId() {
    return this.#activeDeviceId;
  }

  /** @returns {boolean} */
  get isRunning() {
    return this.#stream !== null && this.#stream.active;
  }

  /**
   * @returns {{ width: number, height: number }}
   */
  get dimensions() {
    return {
      width: this.#videoEl.videoWidth || 0,
      height: this.#videoEl.videoHeight || 0,
    };
  }
}
