let timelineState = [];
let isPlaying = false;
let globalStartTime = 0;
let playbackRequest;
let audioUrl = null;
let globalBarLength = null;

// DOM Elemente
const playerWrapper = document.getElementById('videoEngine') || document.querySelector('.player-wrapper');
const timelineContainer = document.getElementById('timeline');
const playerStatus = document.getElementById('playerStatus');
const fileInput = document.getElementById('videoUpload');
const audioInput = document.getElementById('audioUpload');
const bgMusic = document.getElementById('bgMusic');
// Toggle-Button für Format-Wechsel eingebunden
const formatToggleBtn = document.getElementById('formatToggleBtn');

let draggedIndex = null;
// Variable speichert das aktuell gewählte Format (16:9 oder 9:16)
let isReelFormat = false;

// 1. Initialisierung
async function init() {
    try {
        const response = await fetch('/load');
        const data = await response.json();
        if (data.timeline) {
            timelineState = data.timeline.map(clip => {
                const factor = clip.duration / (globalBarLength || 5);
                return { 
                    ...clip, 
                    localUrl: null,
                    durationFactor: isNaN(factor) ? 0.25 : Math.max(0.125, Math.min(0.5, factor))
                };
            });
            renderTimeline();
        }
        if (data.audioUrl) {
            audioUrl = data.audioUrl;
            bgMusic.src = audioUrl;
        }
        if (data.barLength) {
            globalBarLength = data.barLength;
        }
    } catch (e) { console.error("Fehler beim Laden:", e); }
}

// 2. Video Upload
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
                duration: globalBarLength ? globalBarLength * 0.25 : 5, // Default: 1/4
                durationFactor: 0.25,
                status: 'uploading'
            };
            timelineState.push(newClip);
            renderTimeline();
            uploadFile(file, tempId, '/upload');
        }
    };
}

// Audio Upload Logik
if (audioInput) {
    audioInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        audioUrl = URL.createObjectURL(file);
        bgMusic.src = audioUrl;
        playerStatus.innerText = `Musik geladen: ${file.name}`;

        const formData = new FormData();
        formData.append('audio', file);
        try {
            const res = await fetch('/upload-audio', { method: 'POST', body: formData });
            const data = await res.json();
            console.log("Audio auf Server gespeichert:", data.serverUrl, "Bar Length:", data.barLength);
            
            if (data.barLength) {
                globalBarLength = data.barLength;
                // Alle Clips mit neuer BarLength synchronisieren
                timelineState.forEach(clip => {
                    clip.duration = clip.durationFactor * globalBarLength;
                });
                syncState();
                renderTimeline();
            }
        } catch (err) { console.error("Audio Upload Fehler:", err); }
    };
}

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

function renderTimeline() {
    if (!timelineContainer || !playerWrapper) return;
    timelineContainer.innerHTML = '';
    playerWrapper.innerHTML = '';

    timelineState.forEach((clip, index) => {
        // Video-Layer
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

        const factors = [
            { value: 0.125, label: '1/8' },
            { value: 0.25, label: '1/4' },
            { value: 0.5, label: '1/2' }
        ];

        div.innerHTML = `
            <button class="delete-btn" title="Clip löschen">✕</button>
            <strong>${clip.name}</strong><br>
            <div class="duration-options">
                ${factors.map(f => `
                    <label class="duration-label">
                        <input type="radio" name="duration-${index}" value="${f.value}"
                            ${clip.durationFactor === f.value ? 'checked' : ''}
                            onchange="updateDuration(${index}, this.value)">
                        ${f.label}
                    </label>
                `).join('')}
            </div>
        `;

        // Drag Events
        div.addEventListener('dragstart', (e) => {
            draggedIndex = index;
            e.dataTransfer.effectAllowed = 'move';
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

            const moved = timelineState.splice(draggedIndex, 1)[0];
            timelineState.splice(index, 0, moved);

            stopPlayback();
            renderTimeline();
            syncState();
        });

        // Löschen
        div.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteClip(index);
        });

        // Klick = Playback
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
    timelineState.splice(index, 1);
    renderTimeline();
    syncState();
    playerStatus.innerText = timelineState.length === 0
        ? "Alle Clips gelöscht"
        : `Clip gelöscht – ${timelineState.length} verbleibend`;
}

function updateDuration(index, value) {
    const factor = parseFloat(value);
    timelineState[index].durationFactor = factor;
    timelineState[index].duration = factor * globalBarLength-0.09;
    syncState();
    renderTimeline();
}

function playbackLoop() {
    if (!isPlaying) return;

    const elapsed = (Date.now() - globalStartTime) / 1000;
    let currentTimelinePos = 0;
    let foundActive = false;

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

async function syncState() {
    const stateToSync = timelineState.map(({localUrl, ...rest}) => rest);
    await fetch('/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            timeline: stateToSync, 
            audioUrl: audioUrl, 
            barLength: globalBarLength 
        })
    });
}

// Buttons binden
document.getElementById('playAllBtn').onclick = startPlayback;

// Logik für den Format-Wechsel Button (16:9 <-> 9:16)
if (formatToggleBtn) {
    formatToggleBtn.onclick = () => {
        isReelFormat = !isReelFormat; // Wechsel der Ansicht
        if (isReelFormat) {
            playerWrapper.classList.add('reel-format'); // Aktiviere 9:16 Layout
            formatToggleBtn.innerText = "Format: 9:16 (Reel)";
        } else {
            playerWrapper.classList.remove('reel-format'); // Zurück zu 16:9 Layout
            formatToggleBtn.innerText = "Format: 16:9";
        }
    };
}

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