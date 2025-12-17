
class schnittvideo:
    def __init__(self, id, video: str = "",laengeInMs: float = 0):
        self.id = id
        self.video = video
        self.laengeInMs = laengeInMs
        print(f"Schnittvideo initialized: ID={self.id}, video={self.video}, laengeInMs={self.laengeInMs}")
        #zuküunftig noch weitere Attribute hinzufügen
        # startpunkt, endpunkt


    def getID(self):
        return self.id

    def getVideo(self):
        return self.video
    def getLaenge(self):
        return self.laengeInMs
    def setlaengeInMs(self, laengeInMs: int):
        self.laengeInMs = laengeInMs

    
    