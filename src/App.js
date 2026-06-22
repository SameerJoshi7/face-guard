/**
 * @file App.js
 * @description Root application class. Wires all modules together,
 * manages UI state, and drives the main detection loop.
 */

import { CONFIG } from './config.js';
import { CameraManager }    from './modules/CameraManager.js';
import { PersonDetector }   from './modules/PersonDetector.js';
import { CanvasOverlay }    from './modules/CanvasOverlay.js';
import { AudioManager }     from './modules/AudioManager.js';
import { AlertManager }     from './modules/AlertManager.js';
import { StorageManager }   from './modules/StorageManager.js';
import { Notifier }         from './modules/Notifier.js';
import { IdentityManager }  from './modules/IdentityManager.js';

export class App {
  // ── DOM references ──────────────────────────────────────────────────────────
  #videoEl          = null;
  #canvasEl         = null;
  #loadingEl        = null;
  #loadingTextEl    = null;
  #armToggleEl      = null;
  #armLabelEl       = null;
  #statusBadgeEl    = null;
  #recBadgeEl       = null;
  #alertFlashEl     = null;
  #alertsLogEl      = null;
  #emptyStateEl     = null;
  #alertCountEl     = null;
  #statFacesEl      = null;
  #statProxEl       = null;
  #statConfEl       = null;
  #cameraSelectEl   = null;
  #sensitivityEl    = null;
  #sensitivityVal   = null;
  #cooldownEl       = null;
  #cooldownVal      = null;
  #ntfyInputEl      = null;
  #btnCopy          = null;
  #btnTest          = null;
  #btnBrowser       = null;
  #btnClearLog      = null;
  #clockEl          = null;
  #toastEl          = null;
  // Identity / Modal
  #setupModalEl     = null;
  #setupFormEl      = null;
  #setupNameEl      = null;
  #setupLocationEl  = null;
  #setupPinEl       = null;
  #btnTogglePinEl   = null;
  #topicPreviewEl   = null;
  #topicPreviewVal  = null;
  #formErrorEl      = null;
  #btnSubmitEl      = null;
  #identityCardEl   = null;
  #identityAvatarEl = null;
  #identityNameEl   = null;
  #identityLocEl    = null;
  #btnChangeIdEl    = null;
  #notifyInfoEl     = null;

  // ── Modules ─────────────────────────────────────────────────────────────────
  #storage  = new StorageManager();
  #camera   = null;
  #detector = null;
  #overlay  = null;
  #audio    = null;
  #alert    = null;
  #notifier = null;

  // ── State ───────────────────────────────────────────────────────────────────
  #loopHandle   = null;
  #clockHandle  = null;
  #isArmed      = true;

  /**
   * Sensitivity levels → proximity threshold overrides.
   * 1 = low (face must be very large), 3 = high (triggers at farther distance)
   */
  #sensitivityMap = {
    1: { alert: 0.35, medium: 0.18 },  // Low — very close only
    2: { alert: 0.22, medium: 0.10 },  // Medium (default)
    3: { alert: 0.13, medium: 0.07 },  // High — triggers from further away
  };

  #sensitivityLabels = { 1: 'Low', 2: 'Medium', 3: 'High' };

  // ── Bootstrap ───────────────────────────────────────────────────────────────

  /**
   * Initializes the application. Called once on page load.
   */
  async init() {
    // Resolve DOM elements
    this.#videoEl          = document.getElementById('camera-feed');
    this.#canvasEl         = document.getElementById('detection-overlay');
    this.#loadingEl        = document.getElementById('camera-loading');
    this.#loadingTextEl    = document.getElementById('loading-text');
    this.#armToggleEl      = document.getElementById('arm-toggle');
    this.#armLabelEl       = document.getElementById('arm-label');
    this.#statusBadgeEl    = document.getElementById('status-badge');
    this.#recBadgeEl       = document.getElementById('rec-badge');
    this.#alertFlashEl     = document.getElementById('alert-flash');
    this.#alertsLogEl      = document.getElementById('alerts-log');
    this.#emptyStateEl     = document.getElementById('empty-state');
    this.#alertCountEl     = document.getElementById('alert-count');
    this.#statFacesEl      = document.getElementById('stat-faces');
    this.#statProxEl       = document.getElementById('stat-proximity');
    this.#statConfEl       = document.getElementById('stat-confidence');
    this.#cameraSelectEl   = document.getElementById('camera-select');
    this.#sensitivityEl    = document.getElementById('sensitivity-slider');
    this.#sensitivityVal   = document.getElementById('sensitivity-value');
    this.#cooldownEl       = document.getElementById('cooldown-slider');
    this.#cooldownVal      = document.getElementById('cooldown-value');
    this.#ntfyInputEl      = document.getElementById('ntfy-channel');
    this.#btnCopy          = document.getElementById('btn-copy-channel');
    this.#btnTest          = document.getElementById('btn-test-notify');
    this.#btnBrowser       = document.getElementById('btn-browser-notify');
    this.#btnClearLog      = document.getElementById('btn-clear-log');
    this.#clockEl          = document.getElementById('system-clock');
    this.#toastEl          = document.getElementById('toast');

    // Identity / Modal DOM elements
    this.#setupModalEl     = document.getElementById('setup-modal');
    this.#setupFormEl      = document.getElementById('setup-form');
    this.#setupNameEl      = document.getElementById('setup-name');
    this.#setupLocationEl  = document.getElementById('setup-location');
    this.#setupPinEl       = document.getElementById('setup-pin');
    this.#btnTogglePinEl   = document.getElementById('btn-toggle-pin');
    this.#topicPreviewEl   = document.getElementById('topic-preview');
    this.#topicPreviewVal  = document.getElementById('topic-preview-value');
    this.#formErrorEl      = document.getElementById('form-error');
    this.#btnSubmitEl      = document.getElementById('btn-setup-submit');
    this.#identityCardEl   = document.getElementById('identity-card');
    this.#identityAvatarEl = document.getElementById('identity-avatar');
    this.#identityNameEl   = document.getElementById('identity-name');
    this.#identityLocEl    = document.getElementById('identity-location');
    this.#btnChangeIdEl    = document.getElementById('btn-change-identity');
    this.#notifyInfoEl     = document.getElementById('notify-info');

    // Instantiate Modules
    this.#camera   = new CameraManager(this.#videoEl);
    this.#detector = new PersonDetector();
    this.#overlay  = new CanvasOverlay(this.#canvasEl);
    this.#audio    = new AudioManager();
    this.#alert    = new AlertManager(this.#storage);

    this.#setupIdentity();
    this.#bindUIEvents();
    this.#startClock();
    await this.#renderAlertLog();

    try {
      // Initialize detector (downloads WASM + model ~5MB on first load)
      await this.#detector.initialize((msg) => {
        this.#loadingTextEl.textContent = msg;
      });

      await this.#startCamera();
      this.#hideLoading();
      this.#startDetectionLoop();

      this.#toast('System online. Camera active.', 'success');
    } catch (err) {
      this.#loadingTextEl.textContent = `Error: ${err.message}`;
      console.error('[App] Initialization failed:', err);
      this.#toast(`Startup failed: ${err.message}`, 'error');
    }

    // Initialize sensitivity level in AlertManager
    this.#alert.sensitivityLevel = Number(this.#sensitivityEl.value);

    // Listen for alert events emitted by AlertManager
    window.addEventListener('faceguard:session-start', this.#onSessionStart.bind(this));
    window.addEventListener('faceguard:session-update', this.#onSessionUpdate.bind(this));
    window.addEventListener('faceguard:session-end', this.#onSessionEnd.bind(this));
  }

  // ── Camera ──────────────────────────────────────────────────────────────────

  async #startCamera() {
    this.#loadingTextEl.textContent = 'Requesting camera access...';

    await this.#camera.start({
      width: CONFIG.camera.preferredWidth,
      height: CONFIG.camera.preferredHeight,
      frameRate: CONFIG.camera.frameRate,
    });

    await this.#populateCameraList();
  }

  async #populateCameraList() {
    const cameras = await this.#camera.getAvailableCameras();
    this.#cameraSelectEl.innerHTML = '';

    cameras.forEach((cam, i) => {
      const opt = document.createElement('option');
      opt.value = cam.deviceId;
      opt.textContent = cam.label || `Camera ${i + 1}`;
      if (cam.deviceId === this.#camera.activeDeviceId) opt.selected = true;
      this.#cameraSelectEl.appendChild(opt);
    });
  }

  // ── Detection Loop ──────────────────────────────────────────────────────────

  #startDetectionLoop() {
    if (this.#loopHandle) return;

    const tick = async () => {
      if (!this.#camera.isRunning || !this.#detector.isReady) return;

      try {
        const detections = this.#detector.detect(this.#videoEl);
        this.#overlay.draw(detections, this.#videoEl);
        this.#updateStats(detections);

        if (this.#isArmed) {
          await this.#alert.evaluate(detections, this.#videoEl, this.#canvasEl);
        }
      } catch (err) {
        console.error('[App] Detection loop error:', err);
      }
    };

    this.#loopHandle = setInterval(tick, CONFIG.detection.scanIntervalMs);
  }

  #stopDetectionLoop() {
    if (this.#loopHandle) {
      clearInterval(this.#loopHandle);
      this.#loopHandle = null;
    }
    this.#overlay.clear();
  }

  // ── Session Alert Handling ──────────────────────────────────────────────────

  #sessionStartTime = 0;

  /**
   * Handles the beginning of an intrusion session.
   * @param {CustomEvent<{ snapshot: Blob, entry: import('./modules/StorageManager.js').AlertEntry }>} event
   */
  async #onSessionStart(event) {
    const { snapshot, entry } = event.detail;
    this.#sessionStartTime = Date.now();

    // Urgent warning beep sequence
    await this.#audio.playAlertBeep();

    // Visual flash
    this.#triggerAlertFlash();

    // Push mobile notification
    const location = IdentityManager.load()?.location || 'Home';
    await this.#notifier.sendSessionStart(snapshot, entry.timestamp, location);

    // Update UI log
    this.#prependAlertCard(entry, true, 'INTRUSION START');
    this.#updateAlertCount();

    this.#toast('🚨 Intrusion detected! Mobile alert sent.', 'alert');
  }

  /**
   * Handles subsequent snapshot captures during an active session.
   * @param {CustomEvent<{ snapshot: Blob, entry: import('./modules/StorageManager.js').AlertEntry, photoNum: number }>} event
   */
  async #onSessionUpdate(event) {
    const { snapshot, entry, photoNum } = event.detail;

    // Soft alert chirp
    try {
      await this.#audio.unlockAudio();
      const ctx = this.#audio.ctx;
      if (ctx) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      }
    } catch {}

    // Small visual flash
    this.#triggerAlertFlash();

    // Push mobile notification update
    const durationSec = Math.round((Date.now() - this.#sessionStartTime) / 1000);
    await this.#notifier.sendSessionUpdate(snapshot, entry.timestamp, photoNum, durationSec);

    // Update UI log
    this.#prependAlertCard(entry, true, `PHOTO #${photoNum}`);
    this.#updateAlertCount();

    this.#toast(`📸 Photo #${photoNum} captured.`, 'info');
  }

  /**
   * Handles the end of an intrusion session.
   * @param {CustomEvent<{ durationSec: number, totalPhotos: number }>} event
   */
  async #onSessionEnd(event) {
    const { durationSec, totalPhotos } = event.detail;

    // Double high-pitched chirp representing "all clear"
    try {
      await this.#audio.unlockAudio();
      const ctx = this.#audio.ctx;
      if (ctx) {
        const playChirp = (delay, freq) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
          gain.gain.setValueAtTime(0.15, ctx.currentTime + delay);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + delay);
          osc.stop(ctx.currentTime + delay + 0.06);
        };
        playChirp(0, 1200);
        playChirp(0.08, 1500);
      }
    } catch {}

    // Push text summary mobile notification
    const location = IdentityManager.load()?.location || 'Home';
    await this.#notifier.sendSessionEnd(Date.now(), durationSec, totalPhotos, location);

    this.#toast('✅ Intrusion ended. Person left.', 'success');
  }

  // ── Identity & Modal ─────────────────────────────────────────────────────────

  #setupIdentity() {
    const identity = IdentityManager.load();

    if (identity) {
      // Already set up — skip modal, use saved topic
      this.#notifier = new Notifier(identity.topic);
      this.#ntfyInputEl.value = identity.topic;
      this.#showIdentityCard(identity);
      this.#hideModal();
    } else {
      // First launch — show setup modal
      this.#notifier = new Notifier('');
      this.#bindModalEvents();
    }
  }

  #bindModalEvents() {
    let debounceTimer = null;

    // Live topic preview as user types
    const onInput = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const name = this.#setupNameEl.value.trim();
        const pin  = this.#setupPinEl.value.trim();

        if (name.length >= 1 && pin.length >= 4) {
          const topic = await IdentityManager.deriveTopic(name, pin);
          this.#topicPreviewVal.textContent = topic;
          this.#topicPreviewEl.style.display = 'flex';
          this.#btnSubmitEl.disabled = false;
          this.#formErrorEl.style.display = 'none';
        } else {
          this.#topicPreviewEl.style.display = 'none';
          this.#btnSubmitEl.disabled = true;
        }
      }, 300);
    };

    this.#setupNameEl.addEventListener('input', onInput);
    this.#setupPinEl.addEventListener('input', onInput);

    // Toggle PIN visibility
    this.#btnTogglePinEl.addEventListener('click', () => {
      const isPassword = this.#setupPinEl.type === 'password';
      this.#setupPinEl.type = isPassword ? 'text' : 'password';
    });

    // Form submit
    this.#setupFormEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name     = this.#setupNameEl.value.trim();
      const location = this.#setupLocationEl.value.trim() || 'Home';
      const pin      = this.#setupPinEl.value.trim();

      if (!name) {
        this.#showFormError('Please enter your name.');
        return;
      }
      if (pin.length < 4) {
        this.#showFormError('PIN must be at least 4 characters.');
        return;
      }

      this.#btnSubmitEl.disabled = true;
      this.#btnSubmitEl.textContent = 'Generating...';

      const topic    = await IdentityManager.deriveTopic(name, pin);
      const identity = IdentityManager.save(name, location, topic);

      this.#notifier.ntfyTopic = topic;
      this.#ntfyInputEl.value  = topic;

      this.#showIdentityCard(identity);
      this.#hideModal();

      this.#toast(`Welcome, ${name}! Your ID: ${topic}`, 'success');
    });
  }

  /** @param {import('./modules/IdentityManager.js').Identity} identity */
  #showIdentityCard(identity) {
    this.#identityAvatarEl.textContent = identity.name.charAt(0).toUpperCase();
    this.#identityNameEl.textContent   = identity.name;
    this.#identityLocEl.textContent    = identity.location;
    this.#identityCardEl.style.display = 'flex';
    this.#notifyInfoEl.style.display   = 'none';

    // Wire change-identity button
    this.#btnChangeIdEl.addEventListener('click', () => {
      IdentityManager.clear();
      this.#identityCardEl.style.display = 'none';
      this.#notifyInfoEl.style.display   = 'block';
      // Reset form
      this.#setupNameEl.value      = '';
      this.#setupPinEl.value       = '';
      this.#setupLocationEl.value  = '';
      this.#topicPreviewEl.style.display = 'none';
      this.#btnSubmitEl.disabled   = true;
      this.#btnSubmitEl.textContent = 'Activate FaceGuard';
      this.#bindModalEvents();
      this.#showModal();
    }, { once: true });
  }

  #showModal() {
    this.#setupModalEl.classList.remove('hidden');
    this.#setupNameEl.focus();
  }

  #hideModal() {
    this.#setupModalEl.classList.add('hidden');
  }

  /** @param {string} msg */
  #showFormError(msg) {
    this.#formErrorEl.textContent = msg;
    this.#formErrorEl.style.display = 'block';
  }

  // ── UI ───────────────────────────────────────────────────────────────────────

  #bindUIEvents() {
    // Arm/Disarm toggle
    this.#armToggleEl.addEventListener('click', () => this.#toggleArmed());

    // Camera selector
    this.#cameraSelectEl.addEventListener('change', async (e) => {
      await this.#camera.switchCamera(e.target.value, {
        width: CONFIG.camera.preferredWidth,
        height: CONFIG.camera.preferredHeight,
      });
    });

    // Sensitivity slider
    this.#sensitivityEl.addEventListener('input', (e) => {
      const level = Number(e.target.value);
      this.#sensitivityVal.textContent = this.#sensitivityLabels[level];
      e.target.setAttribute('aria-valuetext', this.#sensitivityLabels[level]);
      const thresholds = this.#sensitivityMap[level];
      CONFIG.detection.proximity.alert  = thresholds.alert;
      CONFIG.detection.proximity.medium = thresholds.medium;
      this.#alert.sensitivityLevel = level;
    });

    // Cooldown slider
    this.#cooldownEl.addEventListener('input', (e) => {
      const sec = Number(e.target.value);
      this.#cooldownVal.textContent = `${sec}s`;
      this.#alert.cooldownMs = sec * 1000;
    });

    // ntfy channel input — sync on every keystroke (input) AND on blur (change)
    const syncTopic = (e) => {
      const topic = e.target.value.trim();
      if (!topic) return;
      this.#notifier.ntfyTopic = topic;
      localStorage.setItem('faceguard_ntfy_topic', topic);
    };
    this.#ntfyInputEl.addEventListener('input', syncTopic);
    this.#ntfyInputEl.addEventListener('change', syncTopic);

    // Copy channel button
    this.#btnCopy.addEventListener('click', () => {
      const topic = this.#ntfyInputEl.value.trim();
      navigator.clipboard.writeText(topic);
      this.#toast(`Topic "${topic}" copied!`, 'success');
    });

    // Test notification — always read fresh from the input field
    this.#btnTest.addEventListener('click', async () => {
      // Sync topic from input right now (in case user typed but didn't blur)
      const currentTopic = this.#ntfyInputEl.value.trim();
      if (!currentTopic) {
        this.#toast('❌ Enter a topic name first!', 'error');
        this.#ntfyInputEl.focus();
        return;
      }
      this.#notifier.ntfyTopic = currentTopic;
      localStorage.setItem('faceguard_ntfy_topic', currentTopic);

      this.#btnTest.disabled = true;
      this.#btnTest.textContent = 'Sending...';

      const result = await this.#notifier.sendTestNotification();

      this.#btnTest.disabled = false;
      this.#btnTest.textContent = 'Test Notification';

      if (result.ok) {
        this.#toast(`✅ Sent to "${result.topic}"! Check ntfy app.`, 'success');
      } else {
        const errMsg = result.error || `HTTP ${result.status}`;
        this.#toast(`❌ Failed: ${errMsg}`, 'error');
        console.error('[App] Test notification failed:', result);
      }
    });

    // Browser notification permission
    this.#btnBrowser.addEventListener('click', async () => {
      const granted = await this.#notifier.requestBrowserPermission();
      this.#toast(
        granted ? '✅ Browser alerts enabled.' : '❌ Permission denied.',
        granted ? 'success' : 'error',
      );
      if (granted) this.#btnBrowser.textContent = '✓ Browser Alerts On';
    });

    // Clear log
    this.#btnClearLog.addEventListener('click', async () => {
      await this.#storage.clearAlerts();
      await this.#renderAlertLog();
      this.#toast('Alert log cleared.', 'success');
    });
  }

  #toggleArmed() {
    // Unlock AudioContext on first interaction (required for iOS Safari)
    this.#audio.unlockAudio().catch(() => {});

    this.#isArmed = !this.#isArmed;
    this.#alert.armed = this.#isArmed;

    this.#armToggleEl.setAttribute('aria-pressed', String(this.#isArmed));
    this.#armToggleEl.classList.toggle('armed', this.#isArmed);
    this.#armToggleEl.classList.toggle('disarmed', !this.#isArmed);
    this.#armLabelEl.textContent = this.#isArmed ? 'ARMED' : 'DISARMED';
    this.#statusBadgeEl.textContent = this.#isArmed ? 'SCANNING' : 'DISARMED';
    this.#statusBadgeEl.className = `badge badge--status ${this.#isArmed ? '' : 'badge--disarmed'}`;

    if (this.#isArmed) {
      this.#audio.playArmChirp();
      this.#startDetectionLoop();
    } else {
      this.#audio.playDisarmChirp();
      this.#stopDetectionLoop();
    }
  }

  #updateStats(detections) {
    const count = detections.length;
    this.#statFacesEl.textContent = String(count);

    if (count === 0) {
      this.#statProxEl.textContent = '—';
      this.#statConfEl.textContent = '—';

      if (this.#alert.isSessionActive) {
        this.#statusBadgeEl.textContent = `● ACTIVE SESSION (${this.#alert.sessionPhotoCount} photos)`;
        this.#statusBadgeEl.dataset.state = 'alert';
      } else {
        this.#statusBadgeEl.textContent = this.#isArmed ? 'SCANNING' : 'DISARMED';
        this.#statusBadgeEl.dataset.state = this.#isArmed ? 'scanning' : 'disarmed';
      }
      return;
    }

    const closest = detections.reduce((a, b) =>
      a.proximityRatio > b.proximityRatio ? a : b,
    );

    const proximityLabels = {
      'very-close': '⚠ VERY CLOSE',
      'close': '⚠ CLOSE',
      'medium': 'MEDIUM',
      'far': 'FAR',
    };

    this.#statProxEl.textContent = proximityLabels[closest.proximity] ?? '—';
    this.#statConfEl.textContent = `${Math.round(closest.score * 100)}%`;

    if (this.#alert.isSessionActive) {
      this.#statusBadgeEl.textContent = `● ACTIVE SESSION (${this.#alert.sessionPhotoCount} photos)`;
      this.#statusBadgeEl.dataset.state = 'alert';
    } else {
      const isDetected = closest.score > 0.45;
      this.#statusBadgeEl.textContent = isDetected ? 'PERSON DETECTED' : 'SCANNING';
      this.#statusBadgeEl.dataset.state = isDetected ? 'detected' : 'scanning';
    }
  }

  #triggerAlertFlash() {
    this.#alertFlashEl.classList.add('active');
    setTimeout(() => this.#alertFlashEl.classList.remove('active'), 600);
  }

  // ── Alert Log UI ─────────────────────────────────────────────────────────────

  async #renderAlertLog() {
    const alerts = await this.#storage.getAlerts();
    this.#alertsLogEl.innerHTML = '';

    if (alerts.length === 0) {
      this.#alertsLogEl.appendChild(this.#emptyStateEl);
      this.#alertCountEl.textContent = '0 alerts';
      return;
    }

    alerts.forEach((entry) => this.#prependAlertCard(entry, false));
    await this.#updateAlertCount();
  }

  /**
   * @param {import('./modules/StorageManager.js').AlertEntry} entry
   * @param {boolean} [animate=true]
   * @param {string} [customLabel='']
   */
  #prependAlertCard(entry, animate = true, customLabel = '') {
    // Remove empty state if present
    this.#emptyStateEl.remove();

    const card = document.createElement('article');
    card.className = `alert-card ${animate ? 'alert-card--new' : ''}`;
    card.setAttribute('role', 'listitem');

    const timeStr = new Date(entry.timestamp).toLocaleTimeString();
    const dateStr = new Date(entry.timestamp).toLocaleDateString();
    const isClose = entry.proximity === 'close' || entry.proximity === 'very-close';
    const label = customLabel || entry.proximity.toUpperCase().replace('-', ' ');

    card.innerHTML = `
      <div class="alert-card__header">
        <span class="alert-card__dot ${isClose ? 'alert-card__dot--red' : 'alert-card__dot--amber'}"></span>
        <span class="alert-card__time">${timeStr}</span>
        <span class="alert-card__date">${dateStr}</span>
        <span class="alert-card__proximity">${label}</span>
        <span class="alert-card__score">${Math.round(entry.score * 100)}%</span>
      </div>
      ${entry.snapshotUrl
        ? `<img class="alert-card__thumb" src="${entry.snapshotUrl}" alt="Snapshot at ${timeStr}" loading="lazy" />`
        : '<div class="alert-card__no-thumb">No snapshot</div>'
      }
    `;

    if (animate) {
      this.#alertsLogEl.prepend(card);
    } else {
      this.#alertsLogEl.appendChild(card);
    }
  }

  async #updateAlertCount() {
    const alerts = await this.#storage.getAlerts();
    const count = alerts.length;
    this.#alertCountEl.textContent = `${count} alert${count !== 1 ? 's' : ''}`;
  }

  // ── Utilities ────────────────────────────────────────────────────────────────

  /** @type {ReturnType<typeof setTimeout>|null} */
  #toastTimer = null;

  /**
   * @param {string} message
   * @param {'success'|'error'|'alert'|'info'} [type='info']
   */
  #toast(message, type = 'info') {
    if (this.#toastTimer) clearTimeout(this.#toastTimer);
    this.#toastEl.textContent = message;
    this.#toastEl.className = `toast toast--${type} toast--visible`;
    this.#toastTimer = setTimeout(() => {
      this.#toastEl.className = 'toast';
    }, 3500);
  }

  #startClock() {
    const update = () => {
      this.#clockEl.textContent = new Date().toLocaleTimeString();
    };
    update();
    this.#clockHandle = setInterval(update, 1000);
  }

  #hideLoading() {
    this.#loadingEl.style.opacity = '0';
    setTimeout(() => (this.#loadingEl.style.display = 'none'), 400);
  }
}
