/**
 * @file StorageManager.js
 * @description Persists the alert log to IndexedDB.
 * Stores raw binary Blobs directly to optimize space and performance,
 * and handles database schema updates and automatic pruning.
 */

import { CONFIG } from '../config.js';

/**
 * @typedef {Object} AlertEntry
 * @property {string} id
 * @property {number} timestamp
 * @property {Blob|null} snapshotBlob - Binary Blob of snapshot
 * @property {string} [snapshotUrl]   - Temporary Object URL (runtime only)
 * @property {string} proximity
 * @property {number} score
 */

export class StorageManager {
  /** @type {number} */
  #maxEntries = CONFIG.storage.maxLogEntries;

  /**
   * Opens or upgrades the IndexedDB.
   * @returns {Promise<IDBDatabase>}
   */
  #getDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('FaceGuardDB', 1);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('alerts')) {
          db.createObjectStore('alerts', { keyPath: 'id' });
        }
      };

      request.onsuccess = (e) => {
        resolve(e.target.result);
      };

      request.onerror = (e) => {
        reject(e.target.error);
      };
    });
  }

  /**
   * Retrieves all alert entries from storage.
   * @returns {Promise<AlertEntry[]>} Sorted newest-first with temporary object URLs
   */
  async getAlerts() {
    try {
      const db = await this.#getDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('alerts', 'readonly');
        const store = tx.objectStore('alerts');
        const request = store.getAll();

        request.onsuccess = () => {
          const results = request.result || [];

          // Sort newest first
          results.sort((a, b) => b.timestamp - a.timestamp);

          const mapped = results.map((item) => {
            let snapshotUrl = null;
            if (item.snapshotBlob) {
              try {
                snapshotUrl = URL.createObjectURL(item.snapshotBlob);
              } catch (err) {
                console.error('[StorageManager] Failed to create object URL:', err);
              }
            }
            return {
              id: item.id,
              timestamp: item.timestamp,
              proximity: item.proximity,
              score: item.score,
              snapshotUrl,
              snapshotBlob: item.snapshotBlob,
            };
          });

          resolve(mapped);
        };

        request.onerror = () => {
          reject(request.error);
        };
      });
    } catch (err) {
      console.error('[StorageManager] Failed to get alerts:', err);
      return [];
    }
  }

  /**
   * Saves a new alert entry and prunes older ones.
   * @param {Omit<AlertEntry, 'id'>} entry
   * @returns {Promise<AlertEntry>} The saved entry with its generated ID and temp URL
   */
  async saveAlert(entry) {
    const db = await this.#getDb();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const saved = {
      id,
      timestamp: entry.timestamp,
      snapshotBlob: entry.snapshotBlob || null,
      proximity: entry.proximity,
      score: entry.score,
    };

    // Save entry to IndexedDB
    await new Promise((resolve, reject) => {
      const tx = db.transaction('alerts', 'readwrite');
      const store = tx.objectStore('alerts');
      const request = store.put(saved);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    // Prune database in background
    try {
      await this.#pruneOldEntries(db);
    } catch (err) {
      console.warn('[StorageManager] Pruning failed:', err);
    }

    // Generate temp object URL for the returned UI reference
    let snapshotUrl = null;
    if (saved.snapshotBlob) {
      try {
        snapshotUrl = URL.createObjectURL(saved.snapshotBlob);
      } catch (err) {
        console.error('[StorageManager] Failed to create object URL:', err);
      }
    }

    return {
      id: saved.id,
      timestamp: saved.timestamp,
      proximity: saved.proximity,
      score: saved.score,
      snapshotUrl,
      snapshotBlob: saved.snapshotBlob,
    };
  }

  /**
   * Clears all alerts from IndexedDB.
   * @returns {Promise<void>}
   */
  async clearAlerts() {
    const db = await this.#getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('alerts', 'readwrite');
      const store = tx.objectStore('alerts');
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Prunes database entries exceeding the maxLogEntries limit.
   * @param {IDBDatabase} db
   * @returns {Promise<void>}
   */
  #pruneOldEntries(db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('alerts', 'readwrite');
      const store = tx.objectStore('alerts');
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result || [];
        if (results.length <= this.#maxEntries) {
          resolve();
          return;
        }

        // Sort oldest first
        results.sort((a, b) => a.timestamp - b.timestamp);
        const toDelete = results.slice(0, results.length - this.#maxEntries);

        // Delete excess entries
        const deletePromises = toDelete.map((item) => {
          return new Promise((res) => {
            const delReq = store.delete(item.id);
            delReq.onsuccess = () => res();
            delReq.onerror = () => res(); // continue cleaning other entries if one fails
          });
        });

        Promise.all(deletePromises).then(() => resolve());
      };

      request.onerror = () => reject(request.error);
    });
  }
}
