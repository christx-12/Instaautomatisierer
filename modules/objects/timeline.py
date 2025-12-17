from .song import song as Song
from .schnittvideo import schnittvideo as sv
import os
class timeline:
    def __init__(self, id: int = 0, titel: str = "", songpfad: str = "", schnittvideoornderpfad: str = ""):
        self.id = id
        self.titel = titel
        self.song = Song(dateipfad=songpfad)
        self.setSchnittvideos(schnittvideoornderpfad)
        #print(f"Initializing timeline with song at {songpfad} and videos from {self.schnittvideos}")

    def setSchnittvideos(self, schnittvideoornderpfad: str):
        self.schnittvideos = []
        for datei in os.listdir(schnittvideoornderpfad):
            if datei.endswith(('.mp4', '.avi', '.mov')):
                video_path = os.path.join(schnittvideoornderpfad, datei)
                print(f"hier------->{8/(self.song.getBPM()/60)}")
                self.schnittvideos.append(sv(id=len(self.schnittvideos), video=video_path,laengeInMs=8/(self.song.getBPM()/60))) #initialisiere mit geschätzter Länge basierend auf BPM für 8 bars
    def getID(self):
        return self.id 
    def getTitel(self):
        return self.titel
    def getSong(self):
        return self.song
    
    def tojson(self):
        aktuelle_laenge = 0.0
        clips = []
        for video in self.schnittvideos:
            clip = {
                "path": video.getVideo(),
                "in": aktuelle_laenge,
                "out": aktuelle_laenge + video.getLaenge(),
                "src_in": 2.0,
                "track": 0
            }
            clips.append(clip)
            aktuelle_laenge += video.getLaenge()

        return {
            "song": {
                "id": self.song.getID(),
                "titel": self.song.getTitel(),
                "dateipfad": self.song.getDateipfad(),
                "startpunkt": self.song.getStartpunktinSek()
            },
            "clips": clips,
            "total_duration": aktuelle_laenge

        }

    