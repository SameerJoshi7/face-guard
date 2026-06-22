/**
 * @file IdentityManager.js
 * @description Generates and manages a deterministic, user-specific ntfy topic.
 *
 * Algorithm:
 *   SHA-256(lowercase(name) + ":" + pin)
 *   → take first 12 hex chars
 *   → prefix with "fg-"
 *   → result: "fg-3a7b9c2d1e4f"  (always the same for the same name+pin)
 *
 * This is NOT a security mechanism — it just ensures a unique, reproducible
 * topic string per user so they don't have to remember a random code.
 * The PIN adds enough entropy that two users with the same name won't collide.
 */

const STORAGE_KEY = 'faceguard_identity_v1';
const TOPIC_PREFIX = 'fg-';

/**
 * @typedef {Object} Identity
 * @property {string} name        - Display name (e.g. "Sameer")
 * @property {string} location    - Location label (e.g. "Front Door")
 * @property {string} topic       - Derived ntfy topic (e.g. "fg-3a7b9c2d1e4f")
 * @property {number} createdAt   - Unix ms timestamp
 */

export class IdentityManager {

  /**
   * Derives a deterministic ntfy topic from name + PIN using SHA-256.
   * Same inputs always produce the same topic — even across devices.
   *
   * @param {string} name  - User's name (case-insensitive)
   * @param {string} pin   - Personal PIN or passphrase
   * @returns {Promise<string>} topic string like "fg-3a7b9c2d1e4f"
   */
  static async deriveTopic(name, pin) {
    const input = `${name.trim().toLowerCase()}:${pin.trim()}`;
    const encoded = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${TOPIC_PREFIX}${hashHex.slice(0, 12)}`;
  }

  /**
   * Saves an identity to localStorage.
   * @param {string} name
   * @param {string} location
   * @param {string} topic
   * @returns {Identity}
   */
  static save(name, location, topic) {
    /** @type {Identity} */
    const identity = {
      name: name.trim(),
      location: location.trim() || 'Home',
      topic,
      createdAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
    // Also save topic to the notifier key for backwards compatibility
    localStorage.setItem('faceguard_ntfy_topic', topic);
    return identity;
  }

  /**
   * Loads the saved identity from localStorage.
   * @returns {Identity|null}
   */
  static load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /**
   * Clears the stored identity.
   */
  static clear() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('faceguard_ntfy_topic');
  }

  /**
   * Returns true if an identity has been set up.
   * @returns {boolean}
   */
  static hasIdentity() {
    return !!IdentityManager.load();
  }
}
