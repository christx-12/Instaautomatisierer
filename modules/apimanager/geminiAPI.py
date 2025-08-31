import os
import google.generativeai as genai

class GeminiAPI:
    """
    Eine Klasse zur Verwaltung der Kommunikation mit der Google Gemini API.
    """

    def __init__(self, api_key: str, model_name: str = "gemini-1.5-flash"):
        """
        Initialisiert die GeminiAPI-Klasse.

        Args:
            api_key (str): Ihr Google Gemini API-Schlüssel.
            model_name (str, optional): Der Name des zu verwendenden Gemini-Modells. 
                                        Standardmäßig "gemini-1.5-flash".
        """
        self.api_key = api_key
        self.model_name = model_name
        self._configure_api()
        self.model = genai.GenerativeModel(self.model_name)
        self.chat_session = None

    def _configure_api(self):
        """
        Konfiguriert die Gemini-API mit dem bereitgestellten API-Schlüssel.
        """
        try:
            genai.configure(api_key=self.api_key)
        except Exception as e:
            print(f"Fehler bei der Konfiguration der API: {e}")
            raise

    def generate_text(self, prompt: str) -> str:
        """
        Generiert Text basierend auf einem gegebenen Prompt.

        Args:
            prompt (str): Die Eingabeaufforderung für das Modell.

        Returns:
            str: Die vom Modell generierte Textantwort.
        """
        try:
            response = self.model.generate_content(prompt)
            return response.text
        except Exception as e:
            return f"Fehler bei der Textgenerierung: {e}"

    def start_chat(self):
        """
        Startet eine neue Chat-Sitzung.
        """
        self.chat_session = self.model.start_chat(history=[])

    def send_chat_message(self, message: str) -> str:
        """
        Sendet eine Nachricht in der aktuellen Chat-Sitzung.

        Args:
            message (str): Die an das Modell zu sendende Nachricht.

        Returns:
            str: Die Antwort des Modells.
        """
        if not self.chat_session:
            self.start_chat()
        
        try:
            response = self.chat_session.send_message(message)
            return response.text
        except Exception as e:
            return f"Fehler beim Senden der Chat-Nachricht: {e}"

    def get_chat_history(self):
        """
        Gibt den Verlauf der aktuellen Chat-Sitzung zurück.

        Returns:
            list: Eine Liste der Nachrichten im Chatverlauf.
        """
        if self.chat_session:
            return self.chat_session.history
        return []


if __name__ == "__main__":
    api_key = os.environ.get("GEMINI_API_KEY")

    if api_key == "DEIN_API_SCHLÜSSEL":
        print("Bitte ersetzen Sie 'DEIN_API_SCHLÜSSEL' durch  echten API-Schlüssel.")
    else:
        # Initialisieren der API-Klasse
        gemini_api = GeminiAPI(api_key=api_key)

        print("--- Einfache Textgenerierung ---")
        prompt = "Erkläre kurz, was ein neuronales Netzwerk ist."
        response_text = gemini_api.generate_text(prompt)
        print(f"Frage: {prompt}")
        print(f"Antwort: {response_text}\n")

        # hat-Konversation
        print("--- Chat-Konversation ---")
        gemini_api.start_chat() # Starte neue Chat-Sitzung
        
        user_message1 = "Hallo! Kannst du mir bei der Vorbereitung auf ein Vorstellungsgespräch für eine Python-Entwicklerstelle helfen?"
        response1 = gemini_api.send_chat_message(user_message1)
        print(f"Benutzer: {user_message1}")
        print(f"Gemini: {response1}\n")

        user_message2 = "Was sind einige häufige Fragen zu Datenstrukturen?"
        response2 = gemini_api.send_chat_message(user_message2)
        print(f"Benutzer: {user_message2}")
        print(f"Gemini: {response2}\n")

        # Anzeigen des Chat-Verlaufs
        chat_history = gemini_api.get_chat_history()
        print("--- Chat-Verlauf ---")
        for message in chat_history:
            print(f"{message.role}: {message.parts[0].text}")