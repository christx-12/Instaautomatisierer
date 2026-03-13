let timelineState = [];
let isPlaying = false;
let globalStartTime = 0;
let playbackRequest;

// DOM Elemente
const playerWrapper = document.getElementById('videoEngine') || document.querySelector('.player-wrapper');
const timelineContainer = document.getElementById('timeline');
const playerStatus = document.getElementById('playerStatus');
const fileInput = document.getElementById('videoUpload');

// 1. Initialisierung: Lade gespeicherte Timeline vom Server
async function init() {
    try {
        const response = await fetch('/load');
        const data = await response.json();
        if (data.timeline) {
            timelineState = data.timeline.map(clip => ({ ...clip, localUrl: null }));
            renderTimeline();
        }
    } catch (e) { console.error("Fehler beim Laden:", e); }
}

// 2. Video Auswahl & Upload
if (fileInput) {
    fileInput.onchange = async (e) => {
        const files = e.target.files;
        if (!files.length) return;

        for (let file of files) {
            const tempId = "clip-" + Date.now() + Math.random().toString(36).substr(2, 5);
            
            // Neuen Clip lokal hinzufügen
            const newClip = {
                id: tempId,
                name: file.name,
                localUrl: URL.createObjectURL(file), // Sofortige Vorschau möglich
                serverUrl: null,
                duration: 5,
                status: 'uploading'
            };

            timelineState.push(newClip);
            renderTimeline();

            // FormData für Flask Upload
            const formData = new FormData();
            formData.append('video', file);

            try {
                const response = await fetch('/upload', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();

                // State aktualisieren mit der URL vom Server
                const clip = timelineState.find(c => c.id === tempId);
                if (clip) {
                    clip.serverUrl = data.serverUrl;
                    clip.status = 'ready';
                    console.log("Upload fertig:", data.serverUrl);
                    syncState(); // In db.json speichern
                }
            } catch (error) {
                console.error("Upload Fehler:", error);
            }
        }
    };
}

// 3. UI Rendering (Master-Loop Vorbereitung)
function renderTimeline() {
    if (!timelineContainer || !playerWrapper) return;

    timelineContainer.innerHTML = '';
    playerWrapper.innerHTML = ''; // Wichtig: Alle Videos übereinander stapeln
    
    timelineState.forEach((clip, index) => {
        // Video-Layer für den Master-Loop erstellen
        const video = document.createElement('video');
        video.className = 'video-layer';
        video.id = `video-element-${index}`;
        video.src = clip.localUrl || clip.serverUrl;
        video.style.opacity = '0'; 
        video.style.zIndex = index;
        video.muted = true; 
        video.preload = "auto";
        playerWrapper.appendChild(video);

        // Timeline Clip Element
        const div = document.createElement('div');
        div.className = 'timeline-clip';
        div.innerHTML = `
            <strong>${clip.name}</strong><br>
            <input type="number" value="${clip.duration}" min="1" 
                onchange="updateDuration(${index}, this.value)" style="width:40px;"> s
        `;
        div.onclick = (e) => { if(e.target.tagName !== 'INPUT') startPlayback(); };
        timelineContainer.appendChild(div);
    });
}

// 4. Der Master-Loop
function playbackLoop() {
    if (!isPlaying) return;

    const elapsed = (Date.now() - globalStartTime) / 1000;
    let currentTimelinePos = 0;
    let foundActive = false;

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

// 5. Steuerung & Sync
function startPlayback() {
    stopPlayback();
    isPlaying = true;
    globalStartTime = Date.now();
    playbackLoop();
}

function stopPlayback() {
    isPlaying = false;
    cancelAnimationFrame(playbackRequest);
    timelineState.forEach((_, index) => {
        const v = document.getElementById(`video-element-${index}`);
        if(v) { v.pause(); v.style.opacity = '0'; }
    });
}

function updateDuration(index, value) {
    timelineState[index].duration = parseFloat(value);
    syncState();
}

async function syncState() {
    // Nur Daten ohne lokale Blob-URLs an den Server senden
    const stateToSync = timelineState.map(({localUrl, ...rest}) => rest);
    await fetch('/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeline: stateToSync })
    });
}

// Buttons
const playBtn = document.getElementById('playAllBtn');
if (playBtn) playBtn.onclick = startPlayback;

const clearBtn = document.getElementById('clearSessionBtn');
if (clearBtn) {
    clearBtn.onclick = async () => {
        stopPlayback();
        timelineState = [];
        await syncState();
        renderTimeline();
        playerStatus.innerText = "Session gelöscht";
    };
}

// Start
init();