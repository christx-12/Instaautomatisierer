import threading
import asyncio
import websockets
import json
import time
import cv2
import numpy as np
import os
from flask import request
import modules.objects.timeline as tl


from flask import Flask, render_template

# ---------- Timeline / Video ----------

fps = 24

timeline = {
    "clips": [
        {
            "path": r"C:\Projektportfolio\Instaautomatisierer\assets\videos\Summer\148598-794221563.mp4",
            "in": 0.0, "out": 5.0, "src_in": 2.0, "track": 0
        },
        {
            "path": r"C:\Projektportfolio\Instaautomatisierer\assets\videos\Summer\146938-790648594.mp4",
            "in": 1.0, "out": 6.0, "src_in": 2.0, "track": 0, "effect": "fade_in"
        },
        {
            "path": r"C:\Projektportfolio\Instaautomatisierer\assets\videos\Summer\83860-584870571.mp4",
            "in": 2.0, "out": 4.0, "src_in": 2.0, "track": 1
        }
    ],
    "total_duration": 10.0
}

for clip in timeline["clips"]:
    clip["cap"] = cv2.VideoCapture(clip["path"])
    clip["current_frame"] = 0

def get_frame_at(t, timeline):
    frame = np.zeros((720, 1280, 3), dtype=np.uint8)

    for clip in timeline["clips"]:
        if not (clip["in"] <= t <= clip["out"]):
            continue

        cap = clip["cap"]
        src_in = clip.get("src_in", 0.0)
        local_t = (t - clip["in"]) + src_in
        target_frame_idx = int(local_t * fps)

        while clip["current_frame"] < target_frame_idx:
            ret, _ = cap.read()
            if not ret:
                break
            clip["current_frame"] += 1

        ret, clip_frame = cap.read()
        if not ret:
            continue
        clip["current_frame"] += 1

        if clip["track"] == 0:
            frame = clip_frame
        elif clip["track"] == 1:
            h, w = clip_frame.shape[:2]
            frame[0:h, 0:w] = clip_frame

    return frame

# ---------- Shared State für Sync ----------

state = {
    "t": 0.0,
    "playing": False,
}

# ---------- WebSocket Handler ----------

async def handle_video(websocket):
    try:
        while True:
            t = state["t"]
            playing = state["playing"]

            if t > timeline["total_duration"]:
                t = 0.0
                state["t"] = 0.0
                for clip in timeline["clips"]:
                    clip["cap"].set(cv2.CAP_PROP_POS_FRAMES, 0)
                    clip["current_frame"] = 0

            if not playing:
                # Pausiert: nichts senden, nur warten
                await asyncio.sleep(1.0 / fps)
                continue

            frame = get_frame_at(t, timeline)
            frame_small = cv2.resize(frame, (960, 540))

            ok, jpg = cv2.imencode('.jpg', frame_small)
            if not ok:
                await asyncio.sleep(1.0 / fps)
                continue

            import base64
            b64 = base64.b64encode(jpg).decode('ascii')
            await websocket.send(b64)

            await asyncio.sleep(1.0 / fps)
    except websockets.exceptions.ConnectionClosed:
        print("Video client disconnected")
        return
    
async def handle_control(websocket):
    try:
        async for msg in websocket:
            data = json.loads(msg)
            state["t"] = float(data.get("t", state["t"]))
            state["playing"] = bool(data.get("playing", state["playing"]))
    except websockets.exceptions.ConnectionClosed:
        print("Control client disconnected")
        return

async def ws_handler(websocket):
    # Erste Nachricht entscheidet Rolle
    msg = await websocket.recv()
    data = json.loads(msg)
    role = data.get("role")

    if role == "video":
        await handle_video(websocket)
    elif role == "control":
        await handle_control(websocket)
    else:
        await websocket.close()

async def ws_main():
    async with websockets.serve(ws_handler, "0.0.0.0", 8299):
        await asyncio.Future()  # läuft für immer

def start_ws():
    asyncio.run(ws_main())

# ---------- Flask ----------

app = Flask(__name__)

@app.route("/")
def index():
    return render_template("testliverende.html")

@app.route("/start")
def start():
    return render_template("start.html")

@app.route("/upload", methods=["POST"])
def upload():
    videos= request.files.getlist("videos[]")

    song = request.files.get("song")
    print(f"Received {len(videos)} videos and song: {song.filename if song else 'None'}")
    if not videos:
        return "No video uploaded", 400
    if not song:
        return "No song uploaded", 400
    # Speichern der Dateien
    os.makedirs("uploads", exist_ok=True)
    os.makedirs("uploads/videos", exist_ok=True)
    os.makedirs("uploads/songs", exist_ok=True)
    for i, video in enumerate(videos):
        video.save(os.path.join("uploads/videos", f"video{i}.mp4"))
    song_path = os.path.join("uploads/songs", "song.mp3")
    song.save(song_path)
    timeline_obj = tl.timeline(id=1, titel="Meine Timeline", songpfad=song_path, schnittvideoornderpfad="uploads/videos")
    timeline=timeline_obj.tojson()
    return render_template("testliverende.html")
    

if __name__ == "__main__":
    # WebSocket-Server im Hintergrund-Thread starten

    t = threading.Thread(target=start_ws, daemon=True)
    t.start()

    # Flask starten
    app.run(host="0.0.0.0", port=5000, debug=False)
