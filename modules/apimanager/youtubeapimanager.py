import requests
import isodate  

class YouTubeSearch:
    def __init__(self, api_key):
        self.api_key = api_key
        self.api_url = "https://www.googleapis.com/youtube/v3/search"
        self.video_url = "https://www.googleapis.com/youtube/v3/videos"

    def search(self, query, max_results=5):
        params = {
            "part": "snippet",
            "q": query,
            "type": "video",
            "maxResults": max_results * 2,  # Wir holen mehr, weil wir ggf. welche rausfiltern
            "key": self.api_key
        }
        response = requests.get(self.api_url, params=params)
        if response.status_code == 200:
            data = response.json()
            video_ids = [item["id"]["videoId"] for item in data.get("items", [])]
            # Hole Details zu den Vido
            details_params = {
                "part": "contentDetails,snippet",
                "id": ",".join(video_ids),
                "key": self.api_key
            }
            details_response = requests.get(self.video_url, params=details_params)
            if details_response.status_code == 200:
                details_data = details_response.json()
                results = []
                for item in details_data.get("items", []):
                    duration = isodate.parse_duration(item["contentDetails"]["duration"]).total_seconds()
                    if duration <= 65 * 60:  # 65 Minuten in Sekunden
                        video_id = item["id"]
                        title = item["snippet"]["title"]
                        results.append({
                            "title": title,
                            "url": f"https://www.youtube.com/watch?v={video_id}",
                            "duration_min": round(duration / 60, 2)
                        })
                        if len(results) == max_results:
                            break
                return results
            else:
                print("Fehler bei der Video-Details-Anfrage:", details_response.json())
                return []
        else:
            print("Fehler bei der API-Anfrage:", response.json())
            return []

