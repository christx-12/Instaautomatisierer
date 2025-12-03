import yt_dlp
import os

class YouTubeDownloader:
    def __init__(self, output_path='output.mp4'):
        self.output_path = output_path

    def download_video(self, url):
        if os.path.exists(self.output_path):
            os.remove(self.output_path)
        print(f"Downloading video from {url} to {self.output_path}")
        ydl_opts = {
            'outtmpl': self.output_path,
            'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4',
            'merge_output_format': 'mp4',
            'download_sections': ['*:00:00:00-00:00:10']
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
if __name__ == "__main__":
        downloader = YouTubeDownloader("Downloads")
        links=(
            "https://www.youtube.com/watch?v=AZ2gHCQimpQ",
        )
        for link in links:
            output_file = os.path.join("Downloads", f"{link.split('v=')[1].split('&')[0]}.mp4")
            downloader = YouTubeDownloader(output_file)
            downloader.download_video(link)