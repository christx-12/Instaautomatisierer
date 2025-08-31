import modules.objects.post as Post
import os
import openai
import re
import modules.konversation.konversationmangager as konversationmanager
class OpenAIManager:

    """
    A class to manage OpenAI API interactions.
    """

    def __init__(self, api_key=None):
        # API-Key entweder als Argument oder aus Umgebungsvariable lesen
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OpenAI API-Key fehlt.")
        self.client = openai.OpenAI(api_key=self.api_key)
        self.konversationmanager = konversationmanager.KonversationManager()    

    def getposttheme(self):

        """
        Übersetzt den gegebenen Text in die gewünschte Zielsprache mit o4-mini.
        :param text: Zu übersetzender Text (str)
        :param ziel_sprache: Ziel-Sprache (z.B. 'English', 'French', 'German')
        :return: Übersetzter Text (str)
        """
        bisherige_themen = self.konversationmanager.lade_themen()
        themen_string = "\n".join(f"- {t}" for t in bisherige_themen if t)
        prompt = (
            "Tuh so, als wärst du ein kreativer Content Creator für eine Instagram-Seite, die eine Deep House Spotify Playlist promotet.\n\n"
            "Diese Themen wurden bereits verwendet und sollen nicht wiederholt werden:\n"
            f"{themen_string}\n"
            "Deine Aufgabe:\n\n"

            "Generiere ein neues Reel-Konzept mit einem passenden Thema (z.B. Summer Vibes, Night Vibes oder andere stimmungsvolle Szenen, die zu Deep House passen).\n\n"
            "Suche ein passendes Videothema, das zu diesen Vibes passt.\n\n"
            
            "Erstelle dazu zwei kurze Texte (je 1–7 Wörter):\n"
            "Text1 vor der Hook\n"
            "Text2 nach der Hook (Hook = Catchphrase oder starker Moment)\n\n"
            "Schreibe eine kurze, ansprechende Beschreibung (6–12 Wörter), die Lust auf die Playlist macht und Marketing-Elemente enthält.\n\n"
            "Gib zusätzlich einen passenden, effektiven Suchstring für YouTube an mit & oder | arbeiten, um ein geeignetes Video zu finden am ende bitte immer & Stock |royalty free\n\n"
            "Format der Antwort:\n"
            "thema:\n"
            "text1 vor hoock: text2 nach hoock: beschreibung:\n"
            "suchstring für youtube:\n\n"
            "Beispiel:\n"
            "thema:\n"
            "girl läuft den strand entlang während deeper track von der playlist abgespielt\n"
            "text1:this vibe text2:with the right music beschreibung:Perfekct songs to create chill summer vibes. Playlist in Bio\n"
            "suchstring für youtube: girl walking at the beach & free Stock |royalty free|no copyright \n"
        )

        try:
            print("starte der api anfrage")
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "Du bist kreativer Content Creator für eine Instagram-Seite, die eine Deep House Spotify Playlist promotet mit dem namen loco vibes"},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=1000,
                temperature=0.3
            )
            # Die Antwortstruktur kann je nach Library-Version leicht variieren
            print("ende der api anfrage")
            antwort= response.choices[0].message.content.strip()
            thema = re.search(r"thema:\s*(.*?)\n\n", antwort, re.DOTALL)
            text1 = re.search(r"text1:\s*(.*?)\n", antwort)
            text2 = re.search(r"text2:\s*(.*?)\n", antwort)
            beschreibung = re.search(r"beschreibung:\s*(.*)", antwort)
            search= re.search(r"suchstring für youtube:\s*(.*)", antwort)

            thema = thema.group(1).strip() if thema else ""
            if thema:
                self.konversationmanager.speichere_thema(thema)

            text1 = text1.group(1).strip() if text1 else ""
            text2 = text2.group(1).strip() if text2 else ""
            beschreibung = beschreibung.group(1).strip() if beschreibung else ""
            search = search.group(1).strip() if search else ""
            post = Post.Post(
                id=0,  # ID kann später gesetzt werden
                thema=thema, # Video wird später hinzugefügt
                text1=text1,
                text2=text2,
                search=search,
                capture=beschreibung  # Video bearbeitet wird später hinzugefügt
            )

            return post
        except Exception as e:
            return f"Fehler bei der Übersetzung: {e}"
