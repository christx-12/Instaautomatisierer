/* =============================================================
   CutFlow – script.js  (Performance-optimiert)
   Struktur:
     1. Config & Constants
     2. State
     3. DOM Refs
     4. Utils
     5. Init
     6. Upload: Video / Audio
     7. Timeline: render, add, delete, clone, reorder, updateDuration
     8. Playback: start, stop, loop
     9. Sync
    10. UI helpers: toast, status, theme, keyboard, dropzone
   ============================================================= */




/* ── 1. Config ──────────────────────────────────────────────── */
const FACTORS = [
  { value: 0.0625, label: '1/16' },
  { value: 0.125,  label: '⅛'   },
  { value: 0.25,   label: '¼'   },
  { value: 0.5,    label: '½'   },
];
const DEFAULT_BAR    = 5.0;
const TRIM_OFFSET    = 0.09;
const AUDIO_DRIFT_MS = 0.25;
const PLAYBACK_FPS   = 24;
const PLAYBACK_INTERVAL = 1000 / PLAYBACK_FPS;

// FIX: Lookahead-Zeit (in Sekunden) – nächster Clip wird vorab geseekt
const PRELOAD_LOOKAHEAD = 0.08;
// FIX: Toleranz am Sequenzende – ein Frame wird nicht als "kein Clip aktiv" gewertet
const END_TOLERANCE = 1.5 / PLAYBACK_FPS;




/* ── 2. State ───────────────────────────────────────────────── */
const state = {
  timeline:      [],
  audioUrl:      null,
  barLength:     null,
  isPlaying:     false,
  startTime:     0,
  rafHandle:     null,
  draggedIndex:  null,
  totalDuration: 0,
};




/*
  Clip-Schema:
  {
    id:             string,
    name:           string,
    localUrl:       string|null,
    serverUrl:      string|null,
    duration:       number,
    durationFactor: number,
    videoOffset:    number,
    status:         'uploading' | 'ready' | 'error',
  }
*/




/* ── 3. DOM Refs ────────────────────────────────────────────── */
const dom = {
  videoEngine:    () => document.getElementById('videoEngine'),
  timeline:       () => document.getElementById('timeline'),
  tlDropzone:     () => document.getElementById('tlDropzone'),
  bgMusic:        () => document.getElementById('bgMusic'),
  playBtn:        () => document.getElementById('playAllBtn'),
  playIcon:       () => document.getElementById('playIcon'),
  playLabel:      () => document.getElementById('playLabel'),
  statusText:     () => document.getElementById('statusText'),
  statusPill:     () => document.getElementById('statusPill'),
  progressBar:    () => document.getElementById('progressBar'),
  timeOverlay:    () => document.getElementById('timeOverlay'),
  clipCount:      () => document.getElementById('clipCount'),
  barBadge:       () => document.getElementById('barBadgeText'),
  previewEmpty:   () => document.getElementById('previewEmpty'),
  audioBtnLabel:  () => document.getElementById('audioBtnLabel'),
  audioBtnText:   () => document.getElementById('audioBtnText'),
  videoInput:     () => document.getElementById('videoUpload'),
  audioInput:     () => document.getElementById('audioUpload'),
  toastContainer: () => document.getElementById('toastContainer'),
  clearBtn:       () => document.getElementById('clearSessionBtn'),
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


function factorLabel(factor) {
  switch (factor) {
    case 0.0625: return '1/16 Takt';
    case 0.125:  return '⅛ Takt';
    case 0.25:   return '¼ Takt';
    case 0.5:    return '½ Takt';
    default:     return factor + ' Takt';
  }
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


function normalizeClip(clip) {
  const factor = clip.durationFactor
    || (clip.duration / (state.barLength || DEFAULT_BAR));
  return {
    ...clip,
    localUrl:       null,
    status:         clip.status || 'ready',
    durationFactor: isNaN(factor) ? 0.25 : Math.max(0.0625, Math.min(0.5, factor)),
    videoOffset:    clip.videoOffset || 0,
  };
}




/* ── 6. Upload ──────────────────────────────────────────────── */
const upload = {


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
        videoOffset:    0,
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
        timeline._patchCardStatus(id);
        sync.save();
      }
      ui.toast(`"${file.name.substr(0, 18)}" hochgeladen`, 'ok');
    } catch {
      const clip = state.timeline.find(c => c.id === id);
      if (clip) {
        clip.status = 'error';
        timeline._patchCardStatus(id);
      }
      ui.toast('Upload fehlgeschlagen', 'err');
    }
  },


  async handleAudioFile(file) {
    if (!file) return;
    state.audioUrl    = URL.createObjectURL(file);
    dom.bgMusic().src = state.audioUrl;
    ui.markAudioLoaded(file.name);
    ui.setStatus('Audio wird analysiert…', true);


    const fd = new FormData();
    fd.append('audio', file);
    try {
      const res  = await fetch('/upload-audio', { method: 'POST', body: fd });
      const data = await res.json();


      if (data.serverUrl) state.audioUrl = data.serverUrl;
      if (data.barLength) {
        state.barLength = data.barLength;
        ui.updateBarBadge();
        state.timeline.forEach(c => { c.duration = clipDuration(c.durationFactor); });
        calcTotal();
        timeline._patchAllDurations();
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


    dom.timeline().querySelectorAll('.clip-card').forEach(el => el.remove());
    dom.videoEngine().querySelectorAll('.video-layer').forEach(el => el.remove());


    const fragment = document.createDocumentFragment();


    state.timeline.forEach((clip, i) => {
      this._addVideoLayer(clip, i);
      fragment.appendChild(this._createCard(clip, i));
    });


    dom.timeline().insertBefore(fragment, dom.tlDropzone());
  },


  _patchCardStatus(id) {
    const index = state.timeline.findIndex(c => c.id === id);
    if (index === -1) return;
    const clip = state.timeline[index];
    const card = dom.timeline().querySelectorAll('.clip-card')[index];
    if (!card) return;


    card.classList.toggle('uploading', clip.status === 'uploading');
    const existingOverlay = card.querySelector('.clip-thumb-overlay');
    if (clip.status !== 'uploading' && existingOverlay) {
      existingOverlay.remove();
    } else if (clip.status === 'uploading' && !existingOverlay) {
      const overlay = document.createElement('div');
      overlay.className = 'clip-thumb-overlay';
      overlay.innerHTML = '<div class="spinner"></div>';
      card.querySelector('.clip-thumb')?.appendChild(overlay);
    }
  },


  _patchAllDurations() {
    const cards = dom.timeline().querySelectorAll('.clip-card');
    state.timeline.forEach((clip, i) => {
      const card = cards[i];
      if (!card) return;
      const secEl = card.querySelector('.clip-sec');
      if (secEl) secEl.textContent = factorLabel(clip.durationFactor);
    });
  },


  _addVideoLayer(clip, index) {
    const v = document.createElement('video');
    v.id          = `vl-${index}`;
    v.className   = 'video-layer';
    v.src         = clip.localUrl || clip.serverUrl || '';
    v.muted       = true;
    v.preload     = 'auto';
    v.playsInline = true;
    v.style.opacity    = '0';
    v.style.transition = 'opacity 0.06s linear';   // FIX: sanfter Crossfade statt harter Schnitt
    v.style.zIndex     = index;
    dom.videoEngine().appendChild(v);
    return v;
  },


  _createCard(clip, index) {
    const card = document.createElement('div');
    card.className   = 'clip-card' + (clip.status === 'uploading' ? ' uploading' : '');
    card.draggable   = true;
    card.dataset.index = index;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Clip ${index + 1}: ${clip.name}`);


    const thumbSrc = clip.localUrl || clip.serverUrl || '';


    card.innerHTML = `
      <div class="drag-handle" aria-hidden="true"></div>
      <div class="clip-thumb">
        <video data-src="${thumbSrc}"
               muted preload="none"
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
        <span class="clip-sec">${factorLabel(clip.durationFactor)}</span>
        <button class="clip-trim" title="Startzeitpunkt setzen" aria-label="Trim">✂️</button>
        <button class="clip-clone" title="Clip duplizieren" aria-label="Clip klonen">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
        <button class="clip-delete" aria-label="Clip löschen" title="Löschen">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>`;


    const thumbVideo = card.querySelector('.clip-thumb video');
    if (thumbVideo) {
      const obs = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) {
          thumbVideo.src = thumbVideo.dataset.src;
          obs.disconnect();
        }
      }, { rootMargin: '100px' });
      obs.observe(thumbVideo);
    }


    this._bindCardEvents(card, index);
    return card;
  },


  _bindCardEvents(card, index) {
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


    card.addEventListener('click', (e) => {
      if (
        e.target.closest('.clip-delete') ||
        e.target.closest('.dur-btn')     ||
        e.target.closest('.clip-clone')  ||
        e.target.closest('.clip-trim')
      ) return;
      playback.start(index);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playback.start(index); }
    });


    card.querySelectorAll('.dur-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.updateDuration(index, parseFloat(btn.dataset.val));
      });
    });


    card.querySelector('.clip-trim').addEventListener('click', (e) => {
      e.stopPropagation();
      const currentOffset = state.timeline[index].videoOffset || 0;
      const input = prompt(
        `Ab welcher Sekunde soll das Video "${state.timeline[index].name}" starten?`,
        currentOffset
      );
      if (input !== null) {
        const newOffset = parseFloat(input.replace(',', '.'));
        if (!isNaN(newOffset) && newOffset >= 0) {
          state.timeline[index].videoOffset = newOffset;
          sync.save();
          ui.toast(`Startzeit auf ${newOffset}s gesetzt`, 'ok');
        } else {
          ui.toast('Ungültige Eingabe (bitte nur Zahlen)', 'err');
        }
      }
    });


    card.querySelector('.clip-clone').addEventListener('click', (e) => {
      e.stopPropagation();
      this.clone(index);
    });


    card.querySelector('.clip-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      this.remove(index);
    });
  },


  updateDuration(index, factor) {
    const clip = state.timeline[index];
    clip.durationFactor = factor;
    clip.duration       = clipDuration(factor);
    calcTotal();
    sync.save();


    const card = dom.timeline().querySelectorAll('.clip-card')[index];
    if (!card) return;
    card.querySelectorAll('.dur-btn').forEach(btn => {
      btn.classList.toggle('selected', parseFloat(btn.dataset.val) === factor);
    });
    const secEl = card.querySelector('.clip-sec');
    if (secEl) secEl.textContent = factorLabel(factor);
  },


  clone(index) {
    const original = state.timeline[index];
    const cloned = {
      ...original,
      id:      uid(),
      name:    original.name.replace(/(\.[^.]+)$/, '_copy$1'),
      localUrl: original.localUrl,
    };
    state.timeline.splice(index + 1, 0, cloned);
    this.render();
    sync.save();
    ui.toast(`"${original.name.substr(0, 18)}" geklont`, 'ok');
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


  _cards:  [],
  _videos: [],
  _lastFrameTime:   0,
  _lastActiveIndex: -1,


  start(fromIndex = 0) {
    this.stop();
    if (!state.timeline.length) return;


    const offset = state.timeline
      .slice(0, fromIndex)
      .reduce((acc, c) => acc + (c.duration || 0), 0);


    state.isPlaying = true;
    state.startTime = performance.now() - offset * 1000;


    this._cards  = [...dom.timeline().querySelectorAll('.clip-card')];
    this._videos = state.timeline.map((_, i) => document.getElementById(`vl-${i}`));
    this._lastFrameTime   = 0;
    this._lastActiveIndex = -1;


    ui.setPlayingState(true);


    const audio = dom.bgMusic();
    if (state.audioUrl) {
      audio.currentTime = offset;
      audio.play().catch(() => {});
    }


    this._loop();
  },


  stop() {
    state.isPlaying = false;
    cancelAnimationFrame(state.rafHandle);


    dom.bgMusic().pause();
    document.querySelectorAll('.video-layer').forEach(v => { v.pause(); v.style.opacity = '0'; });
    document.querySelectorAll('.clip-card').forEach(c => c.classList.remove('active-clip'));


    this._cards  = [];
    this._videos = [];
    this._lastActiveIndex = -1;


    ui.setPlayingState(false);
    dom.progressBar().style.width  = '0%';
    dom.timeOverlay().textContent  = '0.00s';
    ui.setStatus('Bereit', false);
  },


  _loop() {
    if (!state.isPlaying) return;


    const now     = performance.now();
    const elapsed = (now - state.startTime) / 1000;


    this._syncAudio(elapsed);
    this._updateLayers(elapsed);


    if (now - this._lastFrameTime >= PLAYBACK_INTERVAL) {
      this._lastFrameTime = now;
      this._updateUI(elapsed);
    }


    state.rafHandle = requestAnimationFrame(() => this._loop());
  },


  _syncAudio(elapsed) {
    const audio = dom.bgMusic();
    if (state.audioUrl && Math.abs(audio.currentTime - elapsed) > AUDIO_DRIFT_MS) {
      audio.currentTime = elapsed;
    }
  },


  // ─────────────────────────────────────────────────────────────────────────
  // FIX: Nahtlose Übergänge zwischen Clips
  //
  //  Problem 1 – Lücke zwischen Clips:
  //    elapsed kann durch RAF-Timing exakt auf der Grenze oder einen Frame
  //    drüber liegen → kein Clip als aktiv erkannt → schwarzer Frame.
  //    Fix: 1-Frame-Toleranz (END_TOLERANCE) am Sequenzende.
  //
  //  Problem 2 – Alten Clip zu früh pausiert:
  //    prevVideo.pause() wurde sofort aufgerufen, bevor play() des neuen
  //    Clips resolved hat → sichtbare Lücke.
  //    Fix: pause() erst im .then()-Callback von play() aufrufen.
  //
  //  Problem 3 – play() ist async, neuer Clip braucht einen Frame:
  //    Fix: Neuen Clip ZUERST auf opacity:1 setzen, dann alten ausblenden.
  //
  //  Problem 4 – Nächster Clip nicht vorgecacht:
  //    Fix: PRELOAD_LOOKAHEAD-Sekunden vor Clipende wird der nächste Clip
  //    bereits geseekt (aber unsichtbar), damit er beim Übergang sofort
  //    bereit ist (readyState >= 2).
  //
  //  Problem 5 – Harter Schnitt sichtbar:
  //    Fix: CSS transition 'opacity 0.06s linear' auf jedem video-layer
  //    (gesetzt in _addVideoLayer) sorgt für weichen ~60ms Crossblend.
  // ─────────────────────────────────────────────────────────────────────────
  _updateLayers(elapsed) {
    let pos         = 0;
    let foundActive = false;


    for (let i = 0; i < state.timeline.length; i++) {
      const clip  = state.timeline[i];
      const start = pos;
      const end   = pos + (clip.duration || 0);
      pos         = end;

      const isActive = elapsed >= start && elapsed < end;


      // FIX 4: Nächsten Clip 80ms vor seinem Start vorglühen (seek, aber unsichtbar)
      if (!isActive && i > 0) {
        const prevEnd = end - (clip.duration || 0); // == start
        const isUpNext = elapsed >= start - PRELOAD_LOOKAHEAD && elapsed < start;
        if (isUpNext) {
          const nextVideo = this._videos[i];
          if (nextVideo && nextVideo.style.opacity !== '1' && nextVideo.readyState >= 2) {
            nextVideo.currentTime = clip.videoOffset || 0;
          }
        }
      }


      if (!isActive) continue;

      foundActive = true;
      const video = this._videos[i];
      const card  = this._cards[i];


      // Neuen Clip aktivieren (nur einmal pro Clip-Wechsel)
      if (video && video.style.opacity !== '1') {

        // FIX 3: Erst neuen Clip einblenden …
        video.style.opacity = '1';
        video.currentTime   = (elapsed - start) + (clip.videoOffset || 0);


        // … dann alten Clip ausblenden NACHDEM play() resolved hat
        const prevIndex = this._lastActiveIndex;
        const playPromise = video.play();

        if (playPromise !== undefined) {
          // FIX 2: pause() erst nach erfolgreichem play() des neuen Clips
          playPromise
            .then(() => {
              if (prevIndex >= 0 && prevIndex !== i) {
                const prevCard  = this._cards[prevIndex];
                const prevVideo = this._videos[prevIndex];
                prevCard?.classList.remove('active-clip');
                if (prevVideo) {
                  prevVideo.style.opacity = '0';
                  // Verzögertes pause() nach dem CSS-Fade (60ms)
                  setTimeout(() => prevVideo.pause(), 80);
                }
              }
            })
            .catch(() => {
              // Autoplay blockiert – trotzdem aufräumen
              if (prevIndex >= 0 && prevIndex !== i) {
                const prevCard  = this._cards[prevIndex];
                const prevVideo = this._videos[prevIndex];
                prevCard?.classList.remove('active-clip');
                if (prevVideo) { prevVideo.style.opacity = '0'; prevVideo.pause(); }
              }
            });
        } else {
          // Kein Promise (ältere Browser) – sofort aufräumen
          if (prevIndex >= 0 && prevIndex !== i) {
            const prevCard  = this._cards[prevIndex];
            const prevVideo = this._videos[prevIndex];
            prevCard?.classList.remove('active-clip');
            if (prevVideo) { prevVideo.style.opacity = '0'; prevVideo.pause(); }
          }
        }
      }


      // Card-Highlight nur bei echtem Clip-Wechsel aktualisieren
      if (this._lastActiveIndex !== i) {
        card?.classList.add('active-clip');
        card?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
        this._lastActiveIndex = i;
      }
    }


    if (!foundActive) {
      // FIX 1: Einen Frame Toleranz – kein sofortiger Stopp bei Timing-Ausreißern
      if (elapsed >= state.totalDuration - END_TOLERANCE || elapsed > state.totalDuration) {
        this.stop();
        ui.setStatus('Ende erreicht', false);
        dom.progressBar().style.width = '100%';
      }
      // Else: kurz keinen Clip gefunden → einfach weiter loopen
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
  _timer: null,


  save() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._flush(), 600);
  },


  async _flush() {
    const payload = {
      timeline:  state.timeline.map(({ localUrl, ...rest }) => rest),
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
    const label   = dom.audioBtnLabel();
    const text    = dom.audioBtnText();
    label.classList.add('has-file');
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
    dz.addEventListener('click',    () => dom.videoInput().click());
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
      state.timeline  = [];
      state.audioUrl  = null;
      state.barLength = null;
      dom.bgMusic().src = '';
      dom.audioBtnLabel().classList.remove('has-file');
      dom.audioBtnText().textContent = 'Audio';
      this.updateBarBadge();
      timeline.render();
      await sync._flush();
      this.updateEmptyState();
      this.toast('Session gelöscht', 'info');
    });


    const formatToggleBtn = document.getElementById('formatToggleBtn');
    let isReelFormat = false;
    if (formatToggleBtn) {
      formatToggleBtn.addEventListener('click', () => {
        isReelFormat = !isReelFormat;
        const playerWrapper = dom.videoEngine();
        if (isReelFormat) {
          playerWrapper.classList.add('reel-format');
          formatToggleBtn.innerText = 'Format: 9:16 (Reel)';
        } else {
          playerWrapper.classList.remove('reel-format');
          formatToggleBtn.innerText = 'Format: 16:9';
        }
      });
    }


    const musicVolumeSlider = document.getElementById('musicVolume');
    if (musicVolumeSlider) {
      musicVolumeSlider.addEventListener('input', (e) => {
        dom.bgMusic().volume = parseFloat(e.target.value);
      });
    }
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
