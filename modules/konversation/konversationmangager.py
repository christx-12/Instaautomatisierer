import json
import os

class KonversationManager:
    """
    Klasse zum Verwalten von Konversationen und Themen.
    """
    def __init__(self, themen_datei="themen.json"):
        self.THEMEN_DATEI = themen_datei

    def lade_themen(self):
        if os.path.exists(self.THEMEN_DATEI):
            with open(self.THEMEN_DATEI, "r", encoding="utf-8") as f:
                return json.load(f)
        return []

    def speichere_thema(self,thema):
        themen = self.lade_themen()
        themen.append(thema)
        with open(self.THEMEN_DATEI, "w", encoding="utf-8") as f:
            json.dump(themen, f, ensure_ascii=False, indent=2)
