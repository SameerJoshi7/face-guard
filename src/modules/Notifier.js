/**
 * @file Notifier.js
 * @description Delivers alert notifications via two channels:
 *   1. ntfy.sh HTTP push → appears on phone (ntfy app, NO API key)
 *   2. Browser Web Notifications API → alerts in the browser itself
 *
 * Both channels receive the captured face snapshot as an image attachment.
 */

import { CONFIG } from '../config.js';

export class Notifier {
  /** @type {string} ntfy topic (user-provided or generated default) */
  #ntfyTopic;

  /** @type {boolean} */
  #browserNotifyPermitted = false;

  /**
   * @param {string} [ntfyTopic]
   */
  constructor(ntfyTopic) {
    this.#ntfyTopic = ntfyTopic || CONFIG.notifications.defaultTopic;
  }

  /**
   * Requests browser notification permission.
   * Must be called from a user gesture (e.g., button click).
   * @returns {Promise<boolean>} true if permission granted
   */
  async requestBrowserPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') {
      this.#browserNotifyPermitted = true;
      return true;
    }
    const result = await Notification.requestPermission();
    this.#browserNotifyPermitted = result === 'granted';
    return this.#browserNotifyPermitted;
  }

  /**
   * Sends the session start alert via ntfy.sh and browser notification.
   *
   * @param {Blob}   imageBlob  - JPEG snapshot
   * @param {number} timestamp  - Unix ms
   * @param {string} location   - Device location
   */
  async sendSessionStart(imageBlob, timestamp, location) {
    const timeStr = new Date(timestamp).toLocaleTimeString();
    const title = 'Intrusion Started';
    const message = `Person detected at [${location}] - ${timeStr}`;

    await Promise.allSettled([
      this.#sendNtfy(imageBlob, title, message, 'urgent', 'rotating_light,camera'),
      this.#sendBrowserNotification(imageBlob, `🚨 ${title}`, message),
    ]);
  }

  /**
   * Sends a session update alert with a new snapshot.
   *
   * @param {Blob}   imageBlob  - JPEG snapshot
   * @param {number} timestamp  - Unix ms
   * @param {number} photoNum   - Photo index in current session
   * @param {number} durationSec - Session duration in seconds
   */
  async sendSessionUpdate(imageBlob, timestamp, photoNum, durationSec) {
    const timeStr = new Date(timestamp).toLocaleTimeString();
    const title = `Intrusion Update #${photoNum}`;
    const message = `Person still present. Elapsed: ${durationSec}s - ${timeStr}`;

    await Promise.allSettled([
      this.#sendNtfy(imageBlob, title, message, 'high', 'camera'),
      this.#sendBrowserNotification(imageBlob, `📸 ${title}`, message),
    ]);
  }

  /**
   * Sends the session end summary.
   *
   * @param {number} timestamp  - Unix ms
   * @param {number} durationSec - Session duration in seconds
   * @param {number} photoCount - Total snapshots captured
   * @param {string} location   - Device location
   */
  async sendSessionEnd(timestamp, durationSec, photoCount, location) {
    const timeStr = new Date(timestamp).toLocaleTimeString();
    const title = 'Intrusion Ended';
    const message = `Person left [${location}]. Duration: ${durationSec}s. Photos: ${photoCount} - ${timeStr}`;

    await Promise.allSettled([
      this.#sendNtfyText(title, message, 'default', 'white_check_mark,bell'),
      this.#sendBrowserNotification(null, `✅ ${title}`, message),
    ]);
  }

  /**
   * Sends a test notification to verify the ntfy channel is working.
   * Returns a detailed result object for UI feedback.
   *
   * @returns {Promise<{ ok: boolean, status: number|null, error: string|null, topic: string }>}
   */
  async sendTestNotification() {
    const topic = this.#ntfyTopic?.trim();

    if (!topic) {
      return { ok: false, status: null, error: 'No topic entered', topic: '' };
    }

    const url = `${CONFIG.notifications.ntfyBaseUrl}/${topic}`;

    console.info(`[Notifier] Sending test to: ${url}`);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Title: 'FaceGuard - Connection Test',
          Priority: 'high',
          Tags: 'white_check_mark,bell',
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body: `✅ FaceGuard is connected!\n\nTopic: ${topic}\nTime: ${new Date().toLocaleTimeString()}\n\nYou will receive face photos here when someone is detected within 1 foot of the camera.`,
      });

      const responseText = await res.text().catch(() => '');
      console.info(`[Notifier] ntfy response ${res.status}:`, responseText);

      return {
        ok: res.ok,
        status: res.status,
        error: res.ok ? null : `Server returned ${res.status}: ${responseText}`,
        topic,
      };
    } catch (err) {
      console.error('[Notifier] Test notification network error:', err);
      return {
        ok: false,
        status: null,
        error: `Network error: ${err.message}`,
        topic,
      };
    }
  }

  /**
   * POSTs the snapshot to ntfy.sh as a binary attachment.
   *
   * @param {Blob}   imageBlob
   * @param {string} title
   * @param {string} message
   * @param {string} priority
   * @param {string} tags
   */
  async #sendNtfy(imageBlob, title, message, priority = 'urgent', tags = 'rotating_light,camera') {
    const topic = this.#ntfyTopic?.trim();
    if (!topic) {
      console.warn('[Notifier] No topic set — skipping ntfy send');
      return;
    }

    const url = `${CONFIG.notifications.ntfyBaseUrl}/${topic}`;
    console.info(`[Notifier] Sending alert to: ${url}`);

    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          Title: title,
          Message: message,
          Priority: priority,
          Tags: tags,
          Filename: `faceguard-alert-${Date.now()}.jpg`,
          'Content-Type': 'image/jpeg',
        },
        body: imageBlob,
      });
      const responseText = await res.text().catch(() => '');
      console.info(`[Notifier] Alert sent — HTTP ${res.status}:`, responseText);
    } catch (err) {
      console.error('[Notifier] ntfy alert failed:', err);
    }
  }

  /**
   * POSTs a text message to ntfy.sh.
   *
   * @param {string} title
   * @param {string} message
   * @param {string} priority
   * @param {string} tags
   */
  async #sendNtfyText(title, message, priority = 'default', tags = 'white_check_mark,bell') {
    const topic = this.#ntfyTopic?.trim();
    if (!topic) {
      console.warn('[Notifier] No topic set — skipping ntfy send');
      return;
    }

    const url = `${CONFIG.notifications.ntfyBaseUrl}/${topic}`;
    console.info(`[Notifier] Sending text alert to: ${url}`);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Title: title,
          Priority: priority,
          Tags: tags,
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body: message,
      });
      const responseText = await res.text().catch(() => '');
      console.info(`[Notifier] Text alert sent — HTTP ${res.status}:`, responseText);
    } catch (err) {
      console.error('[Notifier] ntfy text alert failed:', err);
    }
  }

  /**
   * Shows a browser Notification with the snapshot as the icon.
   *
   * @param {Blob|null} imageBlob
   * @param {string}    title
   * @param {string}    body
   */
  async #sendBrowserNotification(imageBlob, title, body) {
    if (!this.#browserNotifyPermitted) return;

    try {
      const iconUrl = imageBlob ? URL.createObjectURL(imageBlob) : null;

      const notification = new Notification(title, {
        body,
        icon: iconUrl,
        badge: '/icons/icon-192.png',
        tag: 'faceguard-alert',
        requireInteraction: true,
      });

      if (iconUrl) {
        notification.onclose = () => URL.revokeObjectURL(iconUrl);
      }
    } catch (err) {
      console.error('[Notifier] Browser notification failed:', err);
    }
  }

  /** @param {string} topic */
  set ntfyTopic(topic) {
    this.#ntfyTopic = topic.trim();
  }

  /** @returns {string} */
  get ntfyTopic() {
    return this.#ntfyTopic;
  }

  /** @returns {boolean} */
  get browserPermitted() {
    return this.#browserNotifyPermitted;
  }
}
