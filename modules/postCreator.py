import objects.post as post
#from .objects import post
import apimanager.geminiAPI as GeminiAPI
import reelmaker as rm
import apimanager.instagramapimanger as InstagramApiManager
import apimanager.dropboxapi as DropboxAPI
import os
from dotenv import load_dotenv

class postMaker:
    def __init__(self):
        load_dotenv()
        self.aiapi_manager = GeminiAPI.GeminiAPI(os.getenv("Gemini_API_KEY"))
        self.post=None
        self.rm=rm.ReelMaker(r"assets\music\jazzy-somedays-extended-mix-solotoko.mp3")
        self.instagram_api = InstagramApiManager.InstagramApiManager(access_token=os.getenv("Instagram_Access_Token"))
        self.dropbox_api = DropboxAPI.DropboxAPI(access_token=os.getenv("Dropbox_Access_Token"))
    def set_post(self, id):
        """Erstellt einen Post mit dem angegebenen Thema und der ID."""
        self.post = post.Post(id)
        return self.post

    def create_post_capture(self, thema):
        self.aiapi_manager.start_chat()
        prompt =  f"""
            Rolle: Du bist ein Social Media Experte für eine House-Musik-Marke. Deine Aufgabe ist es, fesselnde und authentische Instagram-Captions zu erstellen, um die Interaktion zu fördern und Hörer für unsere Spotify-Playlists zu gewinnen.

            Aufgabe: Erstelle eine kurze und atmosphärische Instagram-Caption basierend auf dem vom Nutzer vorgegebenen Thema auf englisch.

            Thema: {thema}

            Anforderungen an die Ausgabe:

            1.  **Caption-Text:** Verfasse 1-2 kurze Sätze, die die Stimmung des Themas perfekt einfangen. Der Ton sollte lässig, positiv und energiegeladen sein – passend zur House-Musik-Szene.
            2.  **Call-to-Action (CTA):** Baue einen direkten und klaren Call-to-Action ein, der die Nutzer auffordert, sich die Playlist über den Link in der Bio anzuhören (z. B. "Playlist in der Bio!", "Den Vibe findest du im Link in unserer Bio.").
            3.  **Emojis:** Verwende 2-4 passende Emojis, die den Text visuell unterstützen und die gewünschte Stimmung verstärken.
            4.  **Hashtags:** Erstelle eine Liste mit 4-5 relevanten Hashtags. Kombiniere dabei allgemeine, themenbezogene Hashtags mit spezifischen Musik-Hashtags (z. B. #housemusic, #deephouse, #techhouse, #spotifyplaylist).

            Struktur der Antwort:
            [Stimmungsvoller Satz]. [Call-to-Action] [Emojis]
            #[Hashtag1] #[Hashtag2] #[Hashtag3] #[Hashtag4] #[Hashtag5]

            for example:
            Sun on your skin, music in the air, friends all around – pure poolside bliss. Playlist in bio! ☀️🎶💦
            #poolvibes #housemusic #deephouse #summerplaylist #spotify
            """
        response=self.aiapi_manager.send_chat_message(prompt)
        print("AI Response:", response)
        if self.post:
            self.post.setCapture(response)
        else:
            self.post = post.Post(0, capture=response)
        return self.post

    def create_post_video_with_2_ordner(self, video_path1, video_path2,bartime1=0.25, bartime2=0.25,starttime=10, output_video="output.mp4"):
        """Setzt das Video für den Post."""
        self.rm.create_reel_with_2_ordner(video_path1, bartime1,bartime2,video_path2,starttime, output_video)
        if self.post:
            self.post.setVideo(output_video)
        else:
            self.post = post.Post(0, video=output_video)
        return self.post
    def post_to_social_media(self):
        """Postet den Post auf Social Media."""
        if self.post.getVideo():
            self.dropbox_api.upload_file(self.post.getVideo(), f"/reelmaker/output.mp4")
            try:
                video_url = self.dropbox_api.get_share_link(f"/reelmaker/output.mp4")[-1]+"1"
                os.environ["Dropbox_Last_LinkUrl"]=video_url
            except Exception as e:
                video_url = os.getenv("Dropbox_Last_LinkUrl")
            print("Video URL:", video_url)
            response = self.instagram_api.post_reel(user_id=os.getenv("Instragram_User_ID"), video_url=video_url, caption=self.post.getCapture())
            print("Instagram Response:", response)
        else:
            print("Kein Video zum Posten vorhanden.")
        return response
if __name__ == "__main__":
    post_maker = postMaker()
    post = post_maker.set_post(1)
    print("Post ID:", post.getID())
    
    thema = "sunrise vibes"
    post_capture = post_maker.create_post_capture(thema)
    print("Post Capture:", post_capture.getCapture())
    
    video_path1 = r"assets\videos\test1"
    video_path2 = r"assets\videos\test2"
    output_video = r"test\output.mp4"
    
    post_video = post_maker.create_post_video_with_2_ordner(video_path1, video_path2,bartime1=0.25,bartime2=0.25,starttime=218, output_video=output_video)
    print("Post Video Path:", post_video.getVideo())
    eingabe = ""
    while eingabe != "quit":
        eingabe = input("Gib etwas ein (oder 'quit' zum Beenden): ")
        if eingabe=="n":
            thema=input("Gib ein neues Thema ein: ")
            post_maker.create_post_capture(thema)
        if eingabe == "p":
            response = post_maker.post_to_social_media()
            print("Social Media Post Response:", response)
            break
        if eingabe == "v":
            post_maker.create_post_video_with_2_ordner(video_path1, video_path2,bartime1=0.25,bartime2=1,starttime=123, output_video=output_video)
            print("neues Video erstellt:")