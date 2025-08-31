class Post:
    def __init__(self, id: int, capture: str = "", video: str = ""):
        self.id = id

    def __repr__(self):
        return f"Post(id={self.id})"
    def getID(self):
        return self.id
    def getCapture(self):
        return self.capture
    def getVideo(self):
        return self.video
    def setCapture(self, capture: str):
        self.capture = capture
    def setVideo(self, video: str):
        self.video = video

