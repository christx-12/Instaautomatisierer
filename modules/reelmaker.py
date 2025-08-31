import cv2
import os
import shutil
from pathlib import Path
import musicAnalyzer as ma
import videoMaker as mM


class ReelMaker:
    def __init__(self, music_data):
        self.music_data = music_data
        self.musicanalyzer = ma.musicAnalyzer(music_data)
        self.video_maker = mM.VideoMaker()
    def create_video_with_ordner(self, ordner_video_path, output_path='output_final.mp4',bar_length=0.25):
        video_dir = Path(ordner_video_path)
        video_files = sorted([f for f in video_dir.iterdir() if f.suffix in ['.mp4', '.avi', '.mov']])
        ordner_namefirst = "daten"
        bartime=self.musicanalyzer.get_bar_time(bar_length)
        os.makedirs(ordner_namefirst, exist_ok=True)
        for video_file in video_files:
            new_video_path = Path(ordner_namefirst) / video_file.name
            self.video_maker.video_process(str(video_file), bartime, str(new_video_path))
        self.video_maker.concatenate_videos_from_folder(ordner_namefirst,output_path)
        shutil.rmtree(ordner_namefirst)

        
    def create_reel_with_2_ordner(self, ordner_video_path1,bar_length1,barlength2, ordner_video_path2,starttime, output_path='output_final.mp4'):
        ordnerfürbeidordner="datenfür2/beideOrdner"
        ordner_namefirst = "datenfür2"
        os.makedirs(ordner_namefirst, exist_ok=True)
        os.makedirs(ordnerfürbeidordner, exist_ok=True)
        self.create_video_with_ordner(ordner_video_path1,str(Path(ordnerfürbeidordner) / "output2.mp4"),bar_length1-0.021)
        self.create_video_with_ordner(ordner_video_path2,str(Path(ordnerfürbeidordner) / "output1.mp4"),barlength2-0.021)
        self.video_maker.concatenate_videos_from_folder(ordnerfürbeidordner,str(Path(ordner_namefirst) / "outputafterconcatenate.mp4"))
        shutil.rmtree(ordnerfürbeidordner)
        st=self.musicanalyzer.get_start_time(starttime)
        self.video_maker.insert_music(str(Path(ordner_namefirst) / "outputafterconcatenate.mp4"), self.music_data, st, str(Path(ordner_namefirst) / "outputaftermusic.mp4"))
        
        
        self.video_maker.filter_video(str(Path(ordner_namefirst) / "outputaftermusic.mp4"), output_path)
        shutil.rmtree(ordner_namefirst)

    def create_reel_with_Ordner(self, ordner_video_path,starttime, output_path='output_final.mp4',bar_length=0.25):
        video_dir = Path(ordner_video_path)
        video_files = sorted([f for f in video_dir.iterdir() if f.suffix in ['.mp4', '.avi', '.mov']])
        ordner_name = "daten/videoordner1"
        ordner_namefirst = "daten"
        bartime=self.musicanalyzer.get_bar_time(bar_length)
        os.makedirs(ordner_namefirst, exist_ok=True)
        os.makedirs(ordner_name, exist_ok=True)  # exist_ok=True verhindert Fehler, falls Ordner schon da ist
        
        for video_file in video_files:
            new_video_path = Path(ordner_name) / video_file.name
            self.video_maker.video_process(str(video_file), bartime-0.03, str(new_video_path))
        self.video_maker.concatenate_videos_from_folder(ordner_name,str(Path(ordner_namefirst) / "outputafterconcatenate.mp4"))
        shutil.rmtree(ordner_name)
        st=self.musicanalyzer.get_start_time(starttime)
        self.video_maker.insert_music(str(Path(ordner_namefirst) / "outputafterconcatenate.mp4"), self.music_data, st, str(Path(ordner_namefirst) / "outputaftermusic.mp4"))
        
        
        self.video_maker.filter_video(str(Path(ordner_namefirst) / "outputaftermusic.mp4"), output_path)
        shutil.rmtree(ordner_namefirst)
if __name__ == "__main__":
    # Beispielaufruf:
    vm = ReelMaker(r'assets\music\Rezident - Push And Pull (Extended Mix).mp3')
    vm.create_reel_with_2_ordner(r'assets\videos\test1',0.25,1,r'assets\videos\test2',117, output_path=r'test\name.mp4')
    
        