from ..musicAnalyzer import musicAnalyzer as ma
class song:
    def __init__(self,startpunktid: int=0, id: int = 0, titel: str = "", dateipfad: str = ""):
        self.id = id
        self.titel = titel
        self.dateipfad = dateipfad
        self.startpunkt= startpunktid
        analyzer = ma(self.dateipfad)
        self.bpm = analyzer.get_bpm()
        self.bar_length = analyzer.get_bar_time()
        self.beat_times = analyzer.get_beat_times()
    
    def getID(self):
        return self.id
    def getTitel(self):
        return self.titel
    def getDateipfad(self):
        return self.dateipfad
    def getStartpunktinSek(self):
        return self.startpunkt
    def getBPM(self):
        return float(self.bpm[0])
    def getbeatTimes(self):
        return self.beat_times
    def setStartpunkt(self, startpunktid: int):
        if startpunktid < 0 or startpunktid >= len(self.beat_times):
            raise IndexError("Startpunkt-ID liegt außerhalb des gültigen Bereichs.")
        self.startpunkt = self.beat_times[startpunktid]
            
    