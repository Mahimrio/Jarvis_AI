import io
import os
import threading

import scipy.io.wavfile
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from pocket_tts import TTSModel

VOICE = os.environ.get("JARVIS_VOICE", "peter_yearsley")

app = FastAPI(title="Jarvis Voice Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

model: TTSModel | None = None
voice_state = None
generate_lock = threading.Lock()


@app.on_event("startup")
def load_model() -> None:
    global model, voice_state
    model = TTSModel.load_model()
    voice_state = model.get_state_for_audio_prompt(VOICE)


class TTSRequest(BaseModel):
    text: str


@app.get("/health")
def health():
    return {"status": "online", "voice": VOICE, "model_loaded": model is not None}


@app.post("/tts")
def tts(req: TTSRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty text")
    if len(text) > 2000:
        text = text[:2000]
    with generate_lock:
        audio = model.generate_audio(voice_state, text)
    buf = io.BytesIO()
    scipy.io.wavfile.write(buf, model.sample_rate, audio.numpy())
    return Response(content=buf.getvalue(), media_type="audio/wav")
