import requests
import json
class DropboxAPI:
    def __init__(self, access_token):
        self.access_token = access_token
        self.upload_url = "https://content.dropboxapi.com/2/files/upload"
        self.delete_url = "https://api.dropboxapi.com/2/files/delete_v2"
        self.headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/octet-stream"
        }

    def upload_file(self, local_file_path, dropbox_path):
        """Lädt eine Datei von local_file_path in die Dropbox unter dropbox_path hoch."""
        with open(local_file_path, "rb") as file:
            data = file.read()
        args = {
            "path": dropbox_path,
            "mode": "add",
            "autorename": True,
            "mute": False,
            "mode":{".tag":"overwrite"}
        }
        headers = self.headers.copy()
        headers["Dropbox-API-Arg"] = json.dumps(args)
        response = requests.post(self.upload_url, headers=headers, data=data)
        if response.status_code != 200:
            raise Exception(f"Fehler beim Hochladen der Datei: {response.text}")
        return response.json()

    def delete_file(self, dropbox_path):
        """Löscht die Datei in der Dropbox unter dropbox_path."""
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        data = {"path": dropbox_path}
        response = requests.post(self.delete_url, headers=headers, json=data)
        return response.json()
    def get_share_link(self, dropbox_path):
        """
        Erstellt einen Freigabelink für die angegebene Datei und gibt ihn zurück.
        """
        url = "https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings"
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        data = {
            "path": dropbox_path,
            "settings": {
                "requested_visibility": "public"
            }
        }
        response = requests.post(url, headers=headers, data=json.dumps(data))
        if not response.ok:
            if response["error_summary"] == "shared_link_already_exists/":
                print("Freigabelink existiert bereits.")
                raise Exception("Freigabelink existiert bereits.")
            raise Exception(f"Fehler beim Erstellen des Share-Links: {response.text}")
        return response.json()["url"]
