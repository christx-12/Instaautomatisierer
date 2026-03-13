let timelineState = [];
let isPlaying = false;
let globalStartTime = 0;
let playbackRequest;
let audioUrl = null; // Neu: Speicher für den Musik-Track

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
                duration: 5,
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
            console.log("Audio auf Server gespeichert:", data.serverUrl);
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

// 3. UI Rendering
function renderTimeline() {
    if (!timelineContainer || !playerWrapper) return;
    timelineContainer.innerHTML = '';
    playerWrapper.innerHTML = ''; 
    
    timelineState.forEach((clip, index) => {
        const video = document.createElement('video');
        video.className = 'video-layer';
        video.id = `video-element-${index}`;
        video.src = clip.localUrl || clip.serverUrl;
        video.style.opacity = '0'; 
        video.style.zIndex = index;
        video.muted = true; // Videos stumm, damit man die Musik hört
        video.preload = "auto";
        playerWrapper.appendChild(video);

        const div = document.createElement('div');
        div.className = 'timeline-clip';
        div.innerHTML = `<strong>${clip.name}</strong><br>
            <input type="number" value="${clip.duration}" min="1" 
            onchange="updateDuration(${index}, this.value)"> s`;
        div.onclick = (e) => { if(e.target.tagName !== 'INPUT') startPlayback(); };
        timelineContainer.appendChild(div);
    });
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
        body: JSON.stringify({ timeline: stateToSync, audioUrl: audioUrl })
    });
}

// Buttons binden
document.getElementById('playAllBtn').onclick = startPlayback;
document.getElementById('clearSessionBtn').onclick = async () => {
    stopPlayback();
    timelineState = [];
    audioUrl = null;
    bgMusic.src = "";
    await syncState();
    renderTimeline();
    playerStatus.innerText = "Session gelöscht";
};

init();