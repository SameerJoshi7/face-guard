/**
 * @file AudioManager.js
 * @description Generates alert beep sequences using the Web Audio API.
 * No audio files required — tones are synthesized in real-time.
 */

import { CONFIG } from '../config.js';

export class AudioManager {
  /** @type {AudioContext|null} */
  #ctx = null;

  /** @type {boolean} */
  #muted = false;

  /**
   * Lazily initializes the AudioContext on first use.
   * (AudioContext must be created after a user gesture in modern browsers)
   * @returns {AudioContext}
   */
  #getContext() {
    if (!this.#ctx || this.#ctx.state === 'closed') {
      this.#ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.#ctx.state === 'suspended') {
      this.#ctx.resume(); // non-blocking; iOS may still need unlockAudio()
    }
    return this.#ctx;
  }

  /**
   * Unlocks the AudioContext on iOS Safari.
   * iOS requires a silent buffer played during a direct user gesture (tap/click)
   * before any audio can be programmatically triggered later.
   * Call this once from any user interaction handler (e.g., the arm button click).
   * @returns {Promise<void>}
   */
  async unlockAudio() {
    const ctx = this.#getContext();
    if (ctx.state === 'running') return; // already unlocked

    // Play a silent buffer — satisfies iOS gesture requirement
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);

    await ctx.resume();
  }

  /**
   * Plays the alert beep sequence (N beeps with interval).
   * @returns {Promise<void>} Resolves when the sequence finishes
   */
  async playAlertBeep() {
    if (this.#muted) return;

    const { beepCount, beepIntervalMs } = CONFIG.audio;

    for (let i = 0; i < beepCount; i++) {
      this.#playTone(CONFIG.audio.beepFrequency, CONFIG.audio.beepDurationSec);
      if (i < beepCount - 1) {
        await this.#delay(beepIntervalMs);
      }
    }
  }

  /**
   * Plays a short disarm confirmation chirp (descending 2-tone).
   * @returns {void}
   */
  playDisarmChirp() {
    if (this.#muted) return;
    this.#playTone(660, 0.1, 0);
    this.#playTone(440, 0.12, 0.12);
  }

  /**
   * Plays a short arm confirmation chirp (ascending 2-tone).
   * @returns {void}
   */
  playArmChirp() {
    if (this.#muted) return;
    this.#playTone(440, 0.1, 0);
    this.#playTone(660, 0.12, 0.12);
  }

  /**
   * Synthesizes a single tone using an OscillatorNode.
   *
   * @param {number} frequency   - Hz
   * @param {number} durationSec - Tone duration in seconds
   * @param {number} [delayS=0]  - Schedule delay from AudioContext.currentTime
   */
  #playTone(frequency, durationSec, delayS = 0) {
    const ctx = this.#getContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = CONFIG.audio.waveType;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + delayS);

    // Smooth attack/release to avoid clicks
    gainNode.gain.setValueAtTime(0, ctx.currentTime + delayS);
    gainNode.gain.linearRampToValueAtTime(
      CONFIG.audio.gainLevel,
      ctx.currentTime + delayS + 0.01,
    );
    gainNode.gain.setValueAtTime(
      CONFIG.audio.gainLevel,
      ctx.currentTime + delayS + durationSec - 0.02,
    );
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + delayS + durationSec);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(ctx.currentTime + delayS);
    oscillator.stop(ctx.currentTime + delayS + durationSec);
  }

  /** @param {number} ms */
  #delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** @param {boolean} value */
  set muted(value) {
    this.#muted = value;
  }

  /** @returns {boolean} */
  get muted() {
    return this.#muted;
  }
}
