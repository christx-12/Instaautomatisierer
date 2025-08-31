import shutil
import ffmpeg
import cv2
import os
from pathlib import Path
from moviepy.editor import VideoFileClip, AudioFileClip
from moviepy.audio.fx.all import audio_loop
from vidspinner import MontageBuilder
from vidspinner.filters import Filter

class VideoMaker:
    def decode_video(self, inputpfad, outputpfad=None):
        if outputpfad is None:
            outputpfad = inputpfad.replace('.mp4', '_decoded.mp4')
        (
        ffmpeg
        .input(inputpfad)
        .output(outputpfad, 
            vcodec='libx264',       # Video in H.264 kodieren
            acodec='aac',           # Audio in AAC kodieren
            movflags='+faststart',  # für schnellere Wiedergabe im Browser
            preset='medium',
            profile='main',
            level='4.0')
        .run()
        )
    def __init__(self):
        pass

    def video_schneiden_mp(self, inputpfad, duration,outputpfad=None):
        """
        Schneidet duration Sekunden aus der Mitte des angegebenen Videos heraus.
        
        Args:
            inputpfad (str): Dateiinputpfad zum Video.
            duration (float): Anzahl Sekunden für den Ausschnitt.
        
        Returns:
            str: inputpfad zum neuen, geschnittenen Video.
        """
        clip = VideoFileClip(inputpfad)
        video_länge = clip.duration

        # Berechne Start- und Endzeit für mittigen Ausschnitt
        start = max(0, (video_länge - duration) / 2)
        end = min(video_länge, start + duration)

        # Subclip erzeugen
        mittelclip = clip.subclipped(start, end)

        # Output-inputpfad generieren
        inputpfad_obj = Path(inputpfad)
        if outputpfad:
            mittelclip.write_videofile(str(outputpfad))
            return str(outputpfad)
        else:
            outputpfad = inputpfad_obj.with_name(f"{inputpfad_obj.stem}_mitte{inputpfad_obj.suffix}")

        # Video speichern
            mittelclip.write_videofile(str(outputpfad))

            return str(outputpfad)
    def video_schneiden_cv(self, inputpfad, duration, outputpfad=None):
        """
        Schneidet duration Sekunden aus der Mitte des angegebenen Videos mit cv2 heraus.
        Speichert das Ergebnis als neues Video ab.

        Args:
            inputpfad (str): Dateiinputpfad zum Video.
            duration (float): Auschnittsdauer in Sekunden.

        Returns:
            str: inputpfad zum neuen Video.
        """
        print("Schneide Video:", duration, "Sekunden aus der Mitte von:", inputpfad)
        cap = cv2.VideoCapture(inputpfad)
        fps = cap.get(cv2.CAP_PROP_FPS)
        print("FPS:", fps)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        video_duration = total_frames / fps
        print("Gesamtdauer des Videos:", video_duration, "Sekunden")
        # Berechne Start- und End-Frame für den mittigen Ausschnitt
        start_time = max(0, (video_duration - duration) / 2)
        end_time = min(video_duration, start_time + duration)
        print(f"Startzeit: {start_time} Sekunden, Endzeit: {end_time} Sekunden")
        start_frame = int(start_time * fps)
        end_frame = int(end_time * fps)

        # VideoWriter vorbereiten
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        if outputpfad is not None:
            out_name = outputpfad
        else:
            out_name = os.path.splitext(inputpfad)[0] + "_mitte.mp4"
        out = cv2.VideoWriter(out_name, fourcc, fps, (width, height))

        # Frames lesen & speichern
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
        for frame_idx in range(start_frame, end_frame):
            ret, frame = cap.read()
            if not ret:
                break
            out.write(frame)

        # Aufräumen
        cap.release()
        out.release()

        return out_name
    
    def to9_16(self, inputpfad, outputpfad=None, zielhoehe=1920):
        cap = cv2.VideoCapture(inputpfad)
        if not cap.isOpened():
            raise IOError("Video konnte nicht geöffnet werden.")

        fps = cap.get(cv2.CAP_PROP_FPS)
        orig_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        orig_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        # Ziel-Parameter berechnen: immer 9:16
        ziel_breite = int(zielhoehe * 9 / 16)
        ziel_groesse = (ziel_breite, zielhoehe)
        ziel_ratio = ziel_breite / zielhoehe

        # Maximaler Skalierungsfaktor, damit das Bild überall groß genug ist
        scale_h = zielhoehe / orig_height
        scale_w = ziel_breite / orig_width
        scale = max(scale_h, scale_w)  # Größerer Faktor verhindert, dass ein Bereich zu klein bleibt

        resized_width = int(orig_width * scale)
        resized_height = int(orig_height * scale)

        base, ext = os.path.splitext(inputpfad)
        outputpfad = base + "_9_16" + ext

        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(outputpfad, fourcc, fps, ziel_groesse)

        for _ in range(total_frames):
            ret, frame = cap.read()
            if not ret:
                break
            # Proportional skalieren
            frame_resized = cv2.resize(frame, (resized_width, resized_height), interpolation=cv2.INTER_AREA)
            # Mittig auf Zielgröße schneiden (crop)
            x_start = (resized_width - ziel_breite) // 2
            y_start = (resized_height - zielhoehe) // 2
            frame_cropped = frame_resized[y_start:y_start+zielhoehe, x_start:x_start+ziel_breite]
            out.write(frame_cropped)

        cap.release()
        out.release()
        return outputpfad
    def rotate_if_horizontal(self, inputpfad, outputpfad=None):
        cap = cv2.VideoCapture(inputpfad)
        if not cap.isOpened():
            raise IOError("Video konnte nicht geöffnet werden")

        fps = cap.get(cv2.CAP_PROP_FPS)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        # Prüfe, ob das Video im Querformat ist
        if width > height:
            # Video wird um 90 Grad gedreht (clockwise)
            rotated_size = (height, width)
            if outputpfad is None:
                base, ext = os.path.splitext(inputpfad)
                outputpfad = base + "_rotated" + ext

            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            out = cv2.VideoWriter(outputpfad, fourcc, fps, rotated_size)

            for _ in range(total_frames):
                ret, frame = cap.read()
                if not ret:
                    break
                # Frame um 90 Grad im Uhrzeigersinn drehen
                rotated = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
                out.write(rotated)

            cap.release()
            out.release()
            return outputpfad
        else:
            # Kein Drehen nötig, gib Originalinputpfad zurück
            cap.release()
            return inputpfad
    def video_process(self, inputpfad, duration=10, outputpfad=None):
        """
        Kombiniert die Funktionen zum Schneiden, Drehen und Zuschneiden eines Videos.
        
        Args:
            inputpfad (str): Dateiinputpfad zum Video.
            duration (float): Dauer des Ausschnitts in Sekunden.
            outputpfad (str): Optionaler Outputinputpfad für das Endvideo.
        
        Returns:
            str: Inputpfad zum bearbeiteten Video.
        """
        durationpreschnitten = duration + 1  # 0.035 Sekunden Puffer für Übergänge
        pfad=r"temp_file.mp4"
        pfad2=r"temp_file2.mp4"
        preschneiden = self.video_schneiden_cv(inputpfad, durationpreschnitten, pfad)
        self.convert_to_30fps(preschneiden, pfad2, target_fps=30)
        geschnitten = self.video_schneiden_cv(pfad2, duration, outputpfad)
        gedreht = self.rotate_if_horizontal(geschnitten)
        final_video = self.to9_16(gedreht, outputpfad)
        if os.path.isfile(geschnitten):
            os.remove(geschnitten)  # oder os.unlink(datei)
        if os.path.isfile(gedreht):
            os.remove(gedreht)
        if os.path.isfile(pfad):
            os.remove(pfad)
        if os.path.isfile(pfad2):
            os.remove(pfad2)
        return final_video
    
    def convert_to_30fps(self,input_file, output_file, target_fps=30):

        cap = cv2.VideoCapture(input_file)
        original_fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = total_frames / original_fps

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_file, fourcc, target_fps, (width, height))

        # Für die Zielanzahl der Frames (bei Ziel-FPS berechnet)
        output_frames = int(round(duration * target_fps))
        wanted_indices = [int(round(i * original_fps / target_fps)) for i in range(output_frames)]

        # Video sequenziell durchgehen
        frame_buffer = {}
        current_idx = 0
        ret, frame = cap.read()
        for idx in range(total_frames):
            if idx in wanted_indices:
                out.write(frame)
            ret, frame = cap.read()
            if not ret:
                break
            current_idx += 1

        cap.release()
        out.release()

    def concatenate_videos_from_folder(self,ordner, output_file):
        # Videodateien sammeln
        video_exts = ['.mp4', '.avi', '.mov', '.mkv']
        video_files = [str(p) for p in Path(ordner).glob('*') if p.suffix.lower() in video_exts]


        if not video_files:
            raise ValueError("Keine Videos im Ordner gefunden!")


        # Eigenschaften vom ersten Video übernehmen
        cap = cv2.VideoCapture(video_files[0])
        fps = cap.get(cv2.CAP_PROP_FPS)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        cap.release()


        # VideoWriter starten
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_file, fourcc, fps, (width, height))


        # Alle Videos hintereinander schreiben
        for vfile in sorted(video_files):
            cap = cv2.VideoCapture(vfile)
            fps = cap.get(cv2.CAP_PROP_FPS)
            print("FPS:", fps)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            video_duration = total_frames / fps
            print("Gesamtdauer des Videos:", video_duration, "Sekunden")
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                if frame.shape[1] != width or frame.shape[0] != height:
                    frame = cv2.resize(frame, (width, height))
                out.write(frame)
            cap.release()
        out.release()
        return output_file

    def insert_music(self, video_path, music_path,start, output_path):
        """
        Fügt Musik zu einem Video hinzu.
        
        Args:
            video_path (str): Pfad zum Video.
            music_path (str): Pfad zur Musikdatei.
            output_path (str): Pfad für das Ausgabedatei.
        
        Returns:
            str: Pfad zum neuen Video mit Musik.
        """
        print("start:", start)
        video_clip = VideoFileClip(video_path)
        audio_clip = AudioFileClip(music_path)
        print(video_clip.duration)
        print(audio_clip.duration)
        audio_clip = audio_clip.subclip(start, start + video_clip.duration)
        # Setze die Audio des Videos auf die Musik
        final_clip = video_clip.set_audio(audio_clip)
        print(audio_clip.duration)
        final_clip.write_videofile(output_path, codec='libx264', audio_codec='aac')

        return output_path
    def filter_video(self, input_videos, output_video, filter_type=Filter.RETRO):
        """
        Wendet einen Filter auf eine Liste von Videos an und speichert das Ergebnis.
        
        Args:
            input_videos (list): Liste der Eingabevideos.
            output_video (str): Pfad für das Ausgabedatei.
            filter_type (Filter): Der anzuwendende Filter.
        
        Returns:
            str: Pfad zum gefilterten Video.
        """
        mb = MontageBuilder()
        mb.input = input_videos
        mb.output = output_video
        mb.add_filter(filter_type)
        mb.build()
        #self.decode_video(output_video,'temp_file.mp4')  # Optional: Video dekodieren, um Kompatibilität zu verbessern
        #os.replace('temp_file.mp4', output_video)
        return output_video
# Anwendung:
# output = concatenate_videos_from_folder("dein_ordner", "alle_zusammen.mp4")
# print("Geschnittenes Video:", output)
        
if __name__ == "__main__":
    # Beispielaufruf:
    vm = VideoMaker()
    neuer_pfad = vm.video_process(r'assets\videos\Summer\3327058-hd_1920_1080_24fps (1).mp4', duration=10,outputpfad=r'test\name.mp4')
    print(f"Neues Video gespeichert unter: {neuer_pfad}")

