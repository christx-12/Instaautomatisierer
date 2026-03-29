from flask import Flask, render_template, request, jsonify, send_from_directory, make_response
import os
import json
import uuid
import sys

# Importiere die eigens erstellte musicAnalyzer Klasse
from modules.musicAnalyzer import musicAnalyzer

app = Flask(__name__)

# WICHTIG: Nutze einen absoluten Pfad oder stelle sicher, dass der Ordner existiert
# Wir legen ihn hier explizit fest
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
DB_FILE = os.path.join(BASE_DIR, 'db.json')

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def load_db():
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, 'r') as f:
                return json.load(f)
        except:
            return {"timeline": []}
    return {"timeline": []}

def save_db(data):
    with open(DB_FILE, 'w') as f:
        json.dump(data, f)

@app.route('/')
def index():
    return render_template('index.html')

# 1. Video hochladen
@app.route('/upload', methods=['POST'])
def upload_video():
    if 'video' not in request.files:
        return jsonify({"error": "Kein Video gefunden"}), 400
    
    file = request.files['video']
    if file.filename == '':
        return jsonify({"error": "Leerer Dateiname"}), 400

    # Generiere einen eindeutigen Dateinamen
    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else 'mp4'
    filename = f"{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    
    file.save(filepath)
    
    # Die URL muss exakt mit der Route unten übereinstimmen
    server_url = f"/uploads/{filename}"
    return jsonify({"serverUrl": server_url})

# 2. Timeline Status synchronisieren
@app.route('/sync', methods=['POST'])
def sync_timeline():
    data = request.json
    save_db(data)
    return jsonify({"status": "success"})

# 2.5. Audio hochladen und analysieren
@app.route('/upload-audio', methods=['POST'])
def upload_audio():
    if 'audio' not in request.files:
        return jsonify({"error": "Kein Audio gefunden"}), 400
    
    file = request.files['audio']
    if file.filename == '':
        return jsonify({"error": "Leerer Dateiname"}), 400

    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else 'mp3'
    filename = f"audio_{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    
    file.save(filepath)
    
    server_url = f"/uploads/{filename}"
    
    # Track analysieren
    try:
        analyzer = musicAnalyzer(filepath)
        bar_length = analyzer.get_bar_time()
        try:
            bar_length = float(bar_length[0])
        except (TypeError, IndexError):
            bar_length = float(bar_length)
    except Exception as e:
        print(f"Fehler bei Audio-Analyse: {e}")
        bar_length = 5.0 # Fallback
        
    return jsonify({
        "serverUrl": server_url,
        "barLength": bar_length
    })

# 3. Timeline Status laden
@app.route('/load', methods=['GET'])
def load_timeline():
    return jsonify(load_db())

# 4. Statische Route für die hochgeladenen Videos (MIT CACHING)
@app.route('/uploads/<filename>')
def uploaded_file(filename):
    # send_from_directory braucht den absoluten Pfad zum Ordner
    response = make_response(send_from_directory(UPLOAD_FOLDER, filename))
    # Wir setzen den Mimetype explizit, damit der Browser nicht raten muss
    response.headers['Content-Type'] = 'video/mp4'
    # Caching für nahtloses Abspielen beim zweiten Mal
    response.headers['Cache-Control'] = 'public, max-age=86400'
    return response

if __name__ == '__main__':
    # Debug-Modus hilft beim Entwickeln
    app.run(debug=True, port=5000)