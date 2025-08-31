import time
import requests
import os
class InstagramApiManager:
    def __init__(self, access_token):
        self.access_token = access_token
        self.api_version = "v22.0"  # Aktuelle API-Version

    def get_user_profile(self, user_id):
        """
        Fetches the profile information of a user by their user ID.
        """
        endpoint = f"/users/{user_id}"
        response = self.api_client.get(endpoint)
        return response.json()

    def get_user_media(self, user_id):
        """
        Fetches the media items of a user by their user ID.
        """
        endpoint = f"/users/{user_id}/media"
        response = self.api_client.get(endpoint)
        return response.json()
    def post_reel(self, user_id, video_url, caption):
        """
        Posts a Reel to a user's Instagram profile using a two-step process.

        :param user_id: The Instagram Business Account ID.
        :param video_url: A publicly accessible URL to the video file.
        :param caption: The caption for the Reel.
        """
        instagram_business_account_id = user_id

        # --- Einen Media Container für das Video erstellen ---
        print("Schritt 1: Erstelle Media Container...")
        media_container_url = f"https://graph.facebook.com/{self.api_version}/{instagram_business_account_id}/media"
        
        container_payload = {
            'media_type': 'REELS',  # Spezifisch für Reels, alternativ 'VIDEO'
            'video_url': video_url,
            'caption': caption,
            'access_token': self.access_token
        }
        print("Container Payload:", container_payload)
        container_response = requests.post(media_container_url, data=container_payload)
        response_json = container_response.json()
        print("Antwort von Container-Erstellung:", response_json)

        if 'id' not in response_json:
            print("Fehler: Konnte den Media Container nicht erstellen.")
            return response_json

        creation_id = response_json['id']
        print(f"Media Container erfolgreich erstellt mit ID: {creation_id}")

        # ---Den Status des Containers abfragen, bis er fertig ist ---
        # Instagram muss das Video im Hintergrund verarbeiten. Das kann dauern.
        print("\nSchritt 2: Warte auf die Verarbeitung des Videos...")
        
        status_code = "IN_PROGRESS"
        retries = 30 # Maximal 30 Versuche
        
        while status_code != "FINISHED" and retries > 0:
            status_check_url = f"https://graph.facebook.com/{self.api_version}/{creation_id}"
            status_payload = {
                'fields': 'status_code',
                'access_token': self.access_token
            }
            status_response = requests.get(status_check_url, params=status_payload)
            status_json = status_response.json()
            
            status_code = status_json.get('status_code')
            print(f"Aktueller Status: {status_code}")

            if status_code == "ERROR":
                print("Fehler bei der Videoverarbeitung.")
                # Optional: Fehlerdetails abfragen
                error_details_payload = {
                    'fields': 'status',
                    'access_token': self.access_token
                }
                error_response = requests.get(status_check_url, params=error_details_payload)
                print("Fehlerdetails:", error_response.json())
                return error_response.json()

            if status_code != "FINISHED":
                time.sleep(10)  # Warte 10 Sekunden vor der nächsten Abfrage
                retries -= 1

        if status_code != "FINISHED":
             print("Zeitüberschreitung: Videoverarbeitung hat zu lange gedauert.")
             return {"error": "Processing timed out."}

        print("Videoverarbeitung abgeschlossen!")

        # -Den fertigen Container veröffentlichen ---
        print("\nSchritt 3: Veröffentliche den Container als Reel...")
        publish_url = f"https://graph.facebook.com/{self.api_version}/{instagram_business_account_id}/media_publish"
        
        publish_payload = {
            'creation_id': creation_id,
            'access_token': self.access_token
        }
        
        publish_response = requests.post(publish_url, data=publish_payload)
        publish_json = publish_response.json()
        print("Antwort von Veröffentlichung:", publish_json)

        return publish_json
    def post_media(self, user_id, videourl, beschreibung):
        """
        Posts media to a user's profile.
        
        :param user_id: The ID of the user to post media for.
        :param media_data: The data for the media to be posted.
        """

        # Ersetze durch deine Werte
        instagram_business_account_id = user_id
        image_url = videourl#r"https://i.postimg.cc/T2WrswxV/pexels-seljansalim-30309982.jpg"
        caption = beschreibung

        # Medien-Objekt erstellen
        print("Creating media object...")
        media_url = f"https://graph.instagram.com/v22.0/{instagram_business_account_id}/media"
        media_payload = {
            "image_url": image_url,
            "caption": caption,
            "access_token": self.access_token
        }
        media_response = requests.post(media_url, data=media_payload)
        print("Media creation response:", media_response.json())
        media_id = media_response.json().get("id")
        print("Media ID:", media_id)

        #  Medien-Objekt veröffentlichen
        publish_url = f"https://graph.instagram.com/v22.0/{instagram_business_account_id}/media_publish"
        publish_payload = {
            "creation_id": media_id,
            "access_token": self.access_token
        }
        publish_response = requests.post(publish_url, data=publish_payload)
        print("Publish response:", publish_response.json())


        return publish_response.json()
if __name__ == "__main__":
    instagram_api = InstagramApiManager(os.environ.get("INSTAGRAM_ACCESS_TOKEN"))
    user_id = "17841472687115475"  # Ersetze durch tatsächliche User-ID
    video_url = "https://www.dropbox.com/scl/fi/n6pa1weehbs8ovm4zjfoh/name.mp4?rlkey=or7d9og3jic82bbhlz3kk6e9y&st=ob53uur2&dl=1"
    instagram_api.post_reel(user_id,video_url,"hi")  # Ersetze durch tatsächliche Video-URL