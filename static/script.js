let timelineState = [];
let isPlaying = false;
let globalStartTime = 0;
let playbackRequest;
let audioUrl = null; // Neu: Speicher für den Musik-Track
let globalBarLength = null; // Neu: Taktlänge der Musik

// DOM Elemente
const playerWrapper = document.getElementById('videoEngine') || document.querySelector('.player-wrapper');
const timelineContainer = document.getElementById('timeline');
const playerStatus = document.getElementById('playerStatus');
const fileInput = document.getElementById('videoUpload');
const audioInput = document.getElementById('audioUpload'); // Neu: Musik Input
const bgMusic = document.getElementById('bgMusic'); // Neu: Audio Player

// 1. Initialisierung
async function init() {
    try {
        const response = await fetch('/load');
        const data = await response.json();
        if (data.timeline) {
            timelineState = data.timeline.map(clip => ({ ...clip, localUrl: null }));
            renderTimeline();
        }
        // Falls der Server auch eine Audio-URL mitschickt:
        if (data.audioUrl) {
            audioUrl = data.audioUrl;
            bgMusic.src = audioUrl;
        }
        if (data.barLength) {
            globalBarLength = data.barLength;
        }
    } catch (e) { console.error("Fehler beim Laden:", e); }
}

// 2. Video & Audio Upload
if (fileInput) {
    fileInput.onchange = async (e) => {
        const files = e.target.files;
        if (!files.length) return;

        for (let file of files) {
            const tempId = "clip-" + Date.now() + Math.random().toString(36).substr(2, 5);
            const newClip = {
                id: tempId,
                name: file.name,
                localUrl: URL.createObjectURL(file),
                serverUrl: null,
                duration: globalBarLength ? Number(globalBarLength.toFixed(2)) : 5,
                status: 'uploading'
            };
            timelineState.push(newClip);
            renderTimeline();
            uploadFile(file, tempId, '/upload');
        }
    };
}

// NEU: Audio Upload Logik
if (audioInput) {
    audioInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Lokale Vorschau sofort setzen
        audioUrl = URL.createObjectURL(file);
        bgMusic.src = audioUrl;
        playerStatus.innerText = `Musik geladen: ${file.name}`;

        // Optional: Upload zum Server
        const formData = new FormData();
        formData.append('audio', file);
        try {
            const res = await fetch('/upload-audio', { method: 'POST', body: formData });
            const data = await res.json();
            console.log("Audio auf Server gespeichert:", data.serverUrl, "Bar Length:", data.barLength);
            
            // Taktlänge speichern und synchronisieren
            if (data.barLength) {
                globalBarLength = data.barLength;
                syncState();
            }
        } catch (err) { console.error("Audio Upload Fehler:", err); }
    };
}

// Hilfsfunktion für Video-Upload (aus deinem alten Code extrahiert)
async function uploadFile(file, tempId, endpoint) {
    const formData = new FormData();
    formData.append('video', file);
    try {
        const response = await fetch(endpoint, { method: 'POST', body: formData });
        const data = await response.json();
        const clip = timelineState.find(c => c.id === tempId);
        if (clip) {
            clip.serverUrl = data.serverUrl;
            clip.status = 'ready';
            syncState();
        }
    } catch (error) { console.error("Upload Fehler:", error); }
}

let draggedIndex = null;

function renderTimeline() {
    if (!timelineContainer || !playerWrapper) return;
    timelineContainer.innerHTML = '';
    playerWrapper.innerHTML = '';

    timelineState.forEach((clip, index) => {
        // Video-Layer (unverändert)
        const video = document.createElement('video');
        video.className = 'video-layer';
        video.id = `video-element-${index}`;
        video.src = clip.localUrl || clip.serverUrl;
        video.style.opacity = '0';
        video.style.zIndex = index;
        video.muted = true;
        video.preload = 'auto';
        playerWrapper.appendChild(video);

        // Timeline-Clip
        const div = document.createElement('div');
        div.className = 'timeline-clip';
        div.draggable = true;
        div.dataset.index = index;

        div.innerHTML = `
            <button class="delete-btn" title="Clip löschen">✕</button>
            <strong>${clip.name}</strong><br>
            <input type="number" value="${clip.duration}" min="1"
                onchange="updateDuration(${index}, this.value)"> s
        `;

        // --- Drag Events ---
        div.addEventListener('dragstart', (e) => {
            draggedIndex = index;
            e.dataTransfer.effectAllowed = 'move';
            // Kurze Verzögerung, damit der Browser das Ghost-Bild rendert
            setTimeout(() => div.classList.add('dragging'), 0);
        });

        div.addEventListener('dragend', () => {
            div.classList.remove('dragging');
            document.querySelectorAll('.timeline-clip').forEach(c => c.classList.remove('drag-over'));
            draggedIndex = null;
        });

        div.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (draggedIndex !== null && draggedIndex !== index) {
                document.querySelectorAll('.timeline-clip').forEach(c => c.classList.remove('drag-over'));
                div.classList.add('drag-over');
            }
        });

        div.addEventListener('dragleave', () => {
            div.classList.remove('drag-over');
        });

        div.addEventListener('drop', (e) => {
            e.preventDefault();
            if (draggedIndex === null || draggedIndex === index) return;

            // Array neu ordnen
            const moved = timelineState.splice(draggedIndex, 1)[0];
            timelineState.splice(index, 0, moved);

            stopPlayback();
            renderTimeline();
            syncState();
        });

        // --- Löschen ---
        div.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation(); // Verhindert Klick auf den Clip selbst
            deleteClip(index);
        });

        // Klick auf Clip = Playback (nur wenn kein Input/Button getroffen)
        div.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
                startPlayback();
            }
        });

        timelineContainer.appendChild(div);
    });
}

function deleteClip(index) {
    stopPlayback();
    timelineState.splice(index, 1);  // Aus Array entfernen
    renderTimeline();
    syncState();
    playerStatus.innerText = timelineState.length === 0
        ? "Alle Clips gelöscht"
        : `Clip gelöscht – ${timelineState.length} verbleibend`;
}

// 4. Der Master-Loop (mit Audio-Sync)
function playbackLoop() {
    if (!isPlaying) return;

    const elapsed = (Date.now() - globalStartTime) / 1000;
    let currentTimelinePos = 0;
    let foundActive = false;

    // Musik-Synchronisation prüfen (erzwingt Gleichlauf, falls Video/Audio driftet)
    if (audioUrl && Math.abs(bgMusic.currentTime - elapsed) > 0.2) {
        bgMusic.currentTime = elapsed;
    }

    timelineState.forEach((clip, index) => {
        const video = document.getElementById(`video-element-${index}`);
        if (!video) return;

        const clipStart = currentTimelinePos;
        const clipEnd = currentTimelinePos + clip.duration;

        if (elapsed >= clipStart && elapsed < clipEnd) {
            if (video.style.opacity !== '1') {
                video.style.opacity = '1';
                video.currentTime = elapsed - clipStart;
                video.play().catch(() => {});
            }
            foundActive = true;
        } else {
            if (video.style.opacity !== '0') {
                video.style.opacity = '0';
                video.pause();
            }
        }
        currentTimelinePos += clip.duration;
    });

    if (!foundActive) {
        stopPlayback();
        playerStatus.innerText = "Ende erreicht";
    } else {
        playerStatus.innerText = `Zeit: ${elapsed.toFixed(2)}s`;
        playbackRequest = requestAnimationFrame(playbackLoop);
    }
}

// 5. Steuerung
function startPlayback() {
    stopPlayback();
    if (timelineState.length === 0) return;
    
    isPlaying = true;
    globalStartTime = Date.now();
    
    if (audioUrl) {
        bgMusic.currentTime = 0;
        bgMusic.play().catch(e => console.warn("Audio-Autoplay verhindert:", e));
    }
    
    playbackLoop();
}

function stopPlayback() {
    isPlaying = false;
    cancelAnimationFrame(playbackRequest);
    
    if (bgMusic) {
        bgMusic.pause();
    }
    
    timelineState.forEach((_, index) => {
        const v = document.getElementById(`video-element-${index}`);
        if(v) { v.pause(); v.style.opacity = '0'; }
    });
}

// Restliche Funktionen (updateDuration, syncState, Buttons) bleiben gleich...
function updateDuration(index, value) {
    timelineState[index].duration = parseFloat(value);
    syncState();
}

async function syncState() {
    const stateToSync = timelineState.map(({localUrl, ...rest}) => rest);
    await fetch('/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeline: stateToSync, audioUrl: audioUrl, barLength: globalBarLength })
    });
}

// Buttons binden
document.getElementById('playAllBtn').onclick = startPlayback;
document.getElementById('clearSessionBtn').onclick = async () => {
    stopPlayback();
    timelineState = [];
    audioUrl = null;
    globalBarLength = null;
    bgMusic.src = "";
    await syncState();
    renderTimeline();
    playerStatus.innerText = "Session gelöscht";
};

init();