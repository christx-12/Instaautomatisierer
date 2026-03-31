/* =============================================================
   CutFlow – script.js
   Struktur:
     1. Config & Constants
     2. State
     3. DOM Refs
     4. Utils
     5. Init
     6. Upload: Video / Audio
     7. Timeline: render, add, delete, reorder, updateDuration
     8. Playback: start, stop, loop
     9. Sync
    10. UI helpers: toast, status, theme, keyboard, dropzone
   ============================================================= */

/* ── 1. Config ──────────────────────────────────────────────── */
const FACTORS = [
  { value: 0.125, label: '⅛' },
  { value: 0.25,  label: '¼'  },
  { value: 0.5,   label: '½'  },
];
const DEFAULT_BAR    = 5.0;   // Fallback-Taktlänge (s) wenn kein Audio analysiert
const TRIM_OFFSET    = 0.09;  // Kleiner Puffer am Clip-Ende um hartes Schneiden zu vermeiden
const AUDIO_DRIFT_MS = 0.25;  // Maximale Audio-Drift bevor re-sync (s)

/* ── 2. State ───────────────────────────────────────────────── */
const state = {
  timeline:       [],   // Array<Clip>
  audioUrl:       null, // blob: oder /uploads/…
  barLength:      null, // erkannte Taktlänge in Sekunden
  isPlaying:      false,
  startTime:      0,    // Date.now() – Offset
  rafHandle:      null,
  draggedIndex:   null,
  totalDuration:  0,
};

/*
  Clip-Schema:
  {
    id:             string,        // einmalige ID
    name:           string,        // Dateiname
    localUrl:       string|null,   // blob: URL (nur Browser-Session)
    serverUrl:      string|null,   // /uploads/… (persistiert)
    duration:       number,        // Sekunden (durationFactor * barLength – TRIM_OFFSET)
    durationFactor: number,        // 0.125 | 0.25 | 0.5
    status:         'uploading' | 'ready' | 'error',
  }
*/

/* ── 3. DOM Refs ────────────────────────────────────────────── */
const dom = {
  videoEngine:   () => document.getElementById('videoEngine'),
  timeline:      () => document.getElementById('timeline'),
  tlDropzone:    () => document.getElementById('tlDropzone'),
  bgMusic:       () => document.getElementById('bgMusic'),
  playBtn:       () => document.getElementById('playAllBtn'),
  playIcon:      () => document.getElementById('playIcon'),
  playLabel:     () => document.getElementById('playLabel'),
  statusText:    () => document.getElementById('statusText'),
  statusPill:    () => document.getElementById('statusPill'),
  progressBar:   () => document.getElementById('progressBar'),
  timeOverlay:   () => document.getElementById('timeOverlay'),
  clipCount:     () => document.getElementById('clipCount'),
  barBadge:      () => document.getElementById('barBadgeText'),
  previewEmpty:  () => document.getElementById('previewEmpty'),
  audioBtnLabel: () => document.getElementById('audioBtnLabel'),
  audioBtnText:  () => document.getElementById('audioBtnText'),
  videoInput:    () => document.getElementById('videoUpload'),
  audioInput:    () => document.getElementById('audioUpload'),
  toastContainer:() => document.getElementById('toastContainer'),
  clearBtn:      () => document.getElementById('clearSessionBtn'),
};

/* ── 4. Utils ───────────────────────────────────────────────── */
const uid = () => 'clip-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

function fmtTime(s) {
  if (s < 60) return s.toFixed(2) + 's';
  return `${Math.floor(s / 60)}m ${(s % 60).toFixed(1)}s`;
}

function calcTotal() {
  state.totalDuration = state.timeline.reduce((acc, c) => acc + (c.duration || 0), 0);
}

function clipDuration(factor) {
  return factor * (state.barLength || DEFAULT_BAR) - TRIM_OFFSET;
}

/* ── 5. Init ────────────────────────────────────────────────── */
async function init() {
  try {
    const res  = await fetch('/load');
    const data = await res.json();

    if (data.barLength) {
      state.barLength = data.barLength;
      ui.updateBarBadge();
    }
    if (data.audioUrl) {
      state.audioUrl = data.audioUrl;
      dom.bgMusic().src = data.audioUrl;
      ui.markAudioLoaded(data.audioUrl);
    }
    if (Array.isArray(data.timeline) && data.timeline.length) {
      state.timeline = data.timeline.map(normalizeClip);
      timeline.render();
      ui.toast(`${state.timeline.length} Clips geladen`, 'ok');
    }
  } catch (err) {
    console.error('[CutFlow] Init fehlgeschlagen:', err);
    ui.toast('Projekt konnte nicht geladen werden', 'err');
  }
  ui.updateEmptyState();
}

/** Stellt sicher, dass geladene Clips alle Pflichtfelder haben */
function normalizeClip(clip) {
  const factor = clip.durationFactor
    || (clip.duration / (state.barLength || DEFAULT_BAR));
  return {
    ...clip,
    localUrl:       null,
    status:         clip.status || 'ready',
    durationFactor: isNaN(factor) ? 0.25 : Math.max(0.125, Math.min(0.5, factor)),
  };
}

/* ── 6. Upload ──────────────────────────────────────────────── */
const upload = {

  /** Mehrere Video-Dateien einstellen */
  handleVideoFiles(files) {
    for (const file of files) {
      if (!file.type.startsWith('video/')) continue;
      const clip = {
        id:             uid(),
        name:           file.name,
        localUrl:       URL.createObjectURL(file),
        serverUrl:      null,
        duration:       clipDuration(0.25),
        durationFactor: 0.25,
        status:         'uploading',
      };
      state.timeline.push(clip);
      timeline.render();
      ui.updateEmptyState();
      this._uploadVideo(file, clip.id);
    }
  },

  async _uploadVideo(file, id) {
    const fd = new FormData();
    fd.append('video', file);
    try {
      const res  = await fetch('/upload', { method: 'POST', body: fd });
      const data = await res.json();
      const clip = state.timeline.find(c => c.id === id);
      if (clip) {
        clip.serverUrl = data.serverUrl;
        clip.status    = 'ready';
        timeline.render();
        sync.save();
      }
      ui.toast(`"${file.name.substr(0, 18)}" hochgeladen`, 'ok');
    } catch {
      const clip = state.timeline.find(c => c.id === id);
      if (clip) { clip.status = 'error'; timeline.render(); }
      ui.toast('Upload fehlgeschlagen', 'err');
    }
  },

  async handleAudioFile(file) {
    if (!file) return;
    state.audioUrl   = URL.createObjectURL(file);
    dom.bgMusic().src = state.audioUrl;
    ui.markAudioLoaded(file.name);
    ui.setStatus('Audio wird analysiert…', true);

    const fd = new FormData();
    fd.append('audio', file);
    try {
      const res  = await fetch('/upload-audio', { method: 'POST', body: fd });
      const data = await res.json();

      if (data.serverUrl) state.audioUrl = data.serverUrl; // Server-URL bevorzugen
      if (data.barLength) {
        state.barLength = data.barLength;
        ui.updateBarBadge();
        // Clip-Dauern an neue Bar-Länge anpassen
        state.timeline.forEach(c => { c.duration = clipDuration(c.durationFactor); });
        calcTotal();
        timeline.render();
        sync.save();
        ui.toast(`Takt erkannt: ${state.barLength.toFixed(2)}s`, 'ok');
      }
      ui.setStatus('Audio geladen', false);
    } catch {
      ui.toast('Audio-Analyse fehlgeschlagen', 'err');
      ui.setStatus('Audio-Fehler', false);
    }
  },
};

/* ── 7. Timeline ────────────────────────────────────────────── */
const timeline = {

  render() {
    calcTotal();
    dom.clipCount().textContent = state.timeline.length;

    // Alle clip-cards entfernen, Dropzone bleibt
    dom.timeline().querySelectorAll('.clip-card').forEach(el => el.remove());
    // Alle video-layer im Engine entfernen und neu aufbauen
    dom.videoEngine().querySelectorAll('.video-layer').forEach(el => el.remove());

    state.timeline.forEach((clip, i) => {
      this._addVideoLayer(clip, i);
      const card = this._createCard(clip, i);
      dom.timeline().insertBefore(card, dom.tlDropzone());
    });
  },

  /** Versteckter Video-Layer im Preview-Engine */
  _addVideoLayer(clip, index) {
    const v = document.createElement('video');
    v.id          = `vl-${index}`;
    v.className   = 'video-layer';
    v.src         = clip.localUrl || clip.serverUrl || '';
    v.muted       = true;
    v.preload     = 'auto';
    v.playsInline = true;
    v.style.opacity  = '0';
    v.style.zIndex   = index;
    dom.videoEngine().appendChild(v);
    return v;
  },

  /** Clip-Karte mit Thumbnail, Dauer-Buttons, Löschen */
  _createCard(clip, index) {
    const card = document.createElement('div');
    card.className   = 'clip-card' + (clip.status === 'uploading' ? ' uploading' : '');
    card.draggable   = true;
    card.dataset.index = index;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Clip ${index + 1}: ${clip.name}`);

    card.innerHTML = `
      <div class="drag-handle" aria-hidden="true"></div>
      <div class="clip-thumb">
        <video src="${clip.localUrl || clip.serverUrl || ''}"
               muted preload="metadata"
               style="width:100%;height:100%;object-fit:cover;"></video>
        ${clip.status === 'uploading'
          ? '<div class="clip-thumb-overlay"><div class="spinner"></div></div>'
          : ''}
      </div>
      <div class="clip-name" title="${clip.name}">${clip.name}</div>
      <div class="clip-dur-row">
        ${FACTORS.map(f => `
          <button class="dur-btn${clip.durationFactor === f.value ? ' selected' : ''}"
                  data-val="${f.value}" aria-label="Dauer ${f.label}">
            ${f.label}
          </button>`).join('')}
      </div>
      <div class="clip-footer">
        <span class="clip-sec">${clip.duration ? clip.duration.toFixed(2) + 's' : '–'}</span>
        <button class="clip-delete" aria-label="Clip löschen" title="Löschen">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>`;

    this._bindCardEvents(card, index);
    return card;
  },

  _bindCardEvents(card, index) {
    // Drag & Drop
    card.addEventListener('dragstart', () => {
      state.draggedIndex = index;
      card.dataset.effectAllowed = 'move';
      setTimeout(() => card.classList.add('dragging'), 0);
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      document.querySelectorAll('.clip-card').forEach(c => c.classList.remove('drag-over'));
      state.draggedIndex = null;
    });
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (state.draggedIndex !== null && state.draggedIndex !== index) {
        document.querySelectorAll('.clip-card').forEach(c => c.classList.remove('drag-over'));
        card.classList.add('drag-over');
      }
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      const from = state.draggedIndex;
      if (from === null || from === index) return;
      const [moved] = state.timeline.splice(from, 1);
      state.timeline.splice(index, 0, moved);
      playback.stop();
      this.render();
      sync.save();
    });

    // Klick: Abspielen ab diesem Clip (ignoriert bei Buttons)
    card.addEventListener('click', (e) => {
      if (e.target.closest('.clip-delete') || e.target.closest('.dur-btn')) return;
      playback.start(index);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playback.start(index); }
    });

    // Dauer-Buttons
    card.querySelectorAll('.dur-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.updateDuration(index, parseFloat(btn.dataset.val));
      });
    });

    // Löschen
    card.querySelector('.clip-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      this.remove(index);
    });
  },

  updateDuration(index, factor) {
    state.timeline[index].durationFactor = factor;
    state.timeline[index].duration       = clipDuration(factor);
    calcTotal();
    sync.save();
    this.render();
  },

  remove(index) {
    playback.stop();
    const [removed] = state.timeline.splice(index, 1);
    this.render();
    sync.save();
    ui.updateEmptyState();
    ui.toast(`"${removed.name.substr(0, 22)}" entfernt`, 'info');
  },
};

/* ── 8. Playback ────────────────────────────────────────────── */
const playback = {

  /**
   * @param {number} fromIndex  - Clip-Index ab dem abgespielt wird (default: 0)
   */
  start(fromIndex = 0) {
    this.stop();
    if (!state.timeline.length) return;

    // Start-Offset: Zeit bis zum gewählten Clip
    const offset = state.timeline
      .slice(0, fromIndex)
      .reduce((acc, c) => acc + (c.duration || 0), 0);

    state.isPlaying  = true;
    state.startTime  = Date.now() - offset * 1000;

    ui.setPlayingState(true);

    const audio = dom.bgMusic();
    if (state.audioUrl) {
      audio.currentTime = offset;
      audio.play().catch(() => {}); // Autoplay-Policy: ignorieren
    }

    this._loop();
  },

  stop() {
    state.isPlaying = false;
    cancelAnimationFrame(state.rafHandle);

    dom.bgMusic().pause();
    document.querySelectorAll('.video-layer').forEach(v => { v.pause(); v.style.opacity = '0'; });
    document.querySelectorAll('.clip-card').forEach(c => c.classList.remove('active-clip'));

    ui.setPlayingState(false);
    dom.progressBar().style.width = '0%';
    dom.timeOverlay().textContent  = '0.00s';
    ui.setStatus('Bereit', false);
  },

  _loop() {
    if (!state.isPlaying) return;
    const elapsed = (Date.now() - state.startTime) / 1000;

    this._syncAudio(elapsed);
    this._updateLayers(elapsed);
    this._updateUI(elapsed);

    state.rafHandle = requestAnimationFrame(() => this._loop());
  },

  _syncAudio(elapsed) {
    const audio = dom.bgMusic();
    if (state.audioUrl && Math.abs(audio.currentTime - elapsed) > AUDIO_DRIFT_MS) {
      audio.currentTime = elapsed;
    }
  },

  _updateLayers(elapsed) {
    let pos        = 0;
    let foundActive = false;

    state.timeline.forEach((clip, i) => {
      const start = pos;
      const end   = pos + (clip.duration || 0);
      const video = document.getElementById(`vl-${i}`);
      const card  = dom.timeline().querySelectorAll('.clip-card')[i];

      const isActive = elapsed >= start && elapsed < end;

      if (isActive) {
        if (video && video.style.opacity !== '1') {
          video.style.opacity = '1';
          video.currentTime   = elapsed - start;
          video.play().catch(() => {});
        }
        card?.classList.add('active-clip');
        card?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
        foundActive = true;
      } else {
        if (video && video.style.opacity !== '0') { video.style.opacity = '0'; video.pause(); }
        card?.classList.remove('active-clip');
      }
      pos = end;
    });

    if (!foundActive) {
      this.stop();
      ui.setStatus('Ende erreicht', false);
      dom.progressBar().style.width = '100%';
    }
  },

  _updateUI(elapsed) {
    if (!state.isPlaying) return;
    if (state.totalDuration > 0) {
      dom.progressBar().style.width = Math.min(elapsed / state.totalDuration * 100, 100) + '%';
    }
    dom.timeOverlay().textContent = fmtTime(elapsed);
    ui.setStatus(`▶ ${fmtTime(elapsed)} / ${fmtTime(state.totalDuration)}`, true);
  },
};

/* ── 9. Sync ────────────────────────────────────────────────── */
const sync = {
  async save() {
    const payload = {
      timeline:  state.timeline.map(({ localUrl, ...rest }) => rest), // localUrl nicht persistieren
      audioUrl:  state.audioUrl,
      barLength: state.barLength,
    };
    try {
      await fetch('/sync', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
    } catch (err) {
      console.warn('[CutFlow] Sync fehlgeschlagen:', err);
    }
  },
};

/* ── 10. UI Helpers ─────────────────────────────────────────── */
const ui = {

  toast(msg, type = 'info') {
    const c = dom.toastContainer();
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span class="toast-dot ${type}"></span><span>${msg}</span>`;
    c.appendChild(t);
    setTimeout(() => {
      t.classList.add('hide');
      setTimeout(() => t.remove(), 220);
    }, 3200);
  },

  setStatus(msg, active = false) {
    dom.statusText().textContent = msg;
    dom.statusPill().classList.toggle('active', active);
  },

  updateBarBadge() {
    dom.barBadge().textContent = state.barLength
      ? state.barLength.toFixed(2) + 's'
      : '–';
  },

  updateEmptyState() {
    dom.previewEmpty().style.opacity = state.timeline.length === 0 ? '1' : '0';
  },

  markAudioLoaded(nameOrUrl) {
    const label = dom.audioBtnLabel();
    const text  = dom.audioBtnText();
    label.classList.add('has-file');
    // Kürze langen Dateinamen
    const display = typeof nameOrUrl === 'string' && nameOrUrl.length > 14
      ? nameOrUrl.substr(0, 12) + '…'
      : nameOrUrl;
    text.textContent = display;
  },

  setPlayingState(playing) {
    const btn   = dom.playBtn();
    const icon  = dom.playIcon();
    const label = dom.playLabel();
    btn.classList.toggle('playing', playing);
    label.textContent = playing ? 'Stop' : 'Abspielen';
    icon.innerHTML    = playing
      ? '<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>'
      : '<polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/>';
  },

  initThemeToggle() {
    const btn  = document.querySelector('[data-theme-toggle]');
    const root = document.documentElement;
    let theme  = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    root.setAttribute('data-theme', theme);
    setIcon();

    btn.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', theme);
      setIcon();
    });

    function setIcon() {
      btn.innerHTML = theme === 'dark'
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    }
  },

  initDropzone() {
    const dz = dom.tlDropzone();
    dz.addEventListener('click', () => dom.videoInput().click());
    dz.addEventListener('dragover',  (e) => { e.preventDefault(); dz.classList.add('drag-active'); });
    dz.addEventListener('dragleave', ()  => dz.classList.remove('drag-active'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('drag-active');
      upload.handleVideoFiles([...e.dataTransfer.files]);
    });
  },

  initKeyboard() {
    document.addEventListener('keydown', (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      if (e.key === ' ')      { e.preventDefault(); state.isPlaying ? playback.stop() : playback.start(); }
      if (e.key === 'Escape') playback.stop();
    });
  },

  initButtons() {
    dom.videoInput().addEventListener('change', (e) => {
      upload.handleVideoFiles([...e.target.files]);
      e.target.value = '';
    });
    dom.audioInput().addEventListener('change', (e) => {
      upload.handleAudioFile(e.target.files[0]);
      e.target.value = '';
    });
    dom.playBtn().addEventListener('click', () => {
      state.isPlaying ? playback.stop() : playback.start();
    });
    dom.clearBtn().addEventListener('click', async () => {
      if (!confirm('Session wirklich löschen?')) return;
      playback.stop();
      state.timeline   = [];
      state.audioUrl   = null;
      state.barLength  = null;
      dom.bgMusic().src = '';
      dom.audioBtnLabel().classList.remove('has-file');
      dom.audioBtnText().textContent = 'Audio';
      this.updateBarBadge();
      timeline.render();
      await sync.save();
      this.updateEmptyState();
      this.toast('Session gelöscht', 'info');
    });
  },
};

/* ── Boot ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  ui.initThemeToggle();
  ui.initButtons();
  ui.initDropzone();
  ui.initKeyboard();
  init();
});
