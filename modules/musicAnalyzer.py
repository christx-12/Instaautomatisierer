import librosa

class musicAnalyzer:
    def __init__(self, music_data):
        self.music_data = music_data
        y, self.sr = librosa.load(music_data)
        self.tempo, self.beat_frames = librosa.beat.beat_track(y=y, sr=self.sr)
        print(f"Geschätztes Tempo: {self.tempo} BPM")
        print("Beat-Frames:", self.beat_frames)


    def get_start_time(self,start_time):
        beatFramesInSeconds = librosa.frames_to_time(self.beat_frames, sr=self.sr)

        for frame in beatFramesInSeconds:
            if frame < start_time:
                continue
            else:
                new_start_time = frame
                break

        return new_start_time
    
    def get_bar_time(self, bar_length=4):
        return bar_length * self.tempo / 60  # Länge eines Taktes in Sekunden
    
if __name__ == "__main__":
     # Beispiel zur Verwendung:
    filename = r"assets\music\cri-astray-feat-half-moon-run-original-mix-anjunadeep.mp3"
    analyzer = musicAnalyzer(filename)
    print(f"Startzeit für den nächsten Beat: {analyzer.get_start_time(10)} Sekunden")
    print(f"Länge eines Taktes: {analyzer.get_bar_time()} Sekunden")