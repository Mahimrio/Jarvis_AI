import io
import threading
from pathlib import Path

import numpy as np
import scipy.io.wavfile
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from pocket_tts import TTSModel, export_model_state

VOICE_DIR = Path(__file__).parent / "voice"
VOICE_MP3 = VOICE_DIR / "jarvis-clone.mp3"
VOICE_CACHE = VOICE_DIR / "jarvis-clone.safetensors"

app = FastAPI(title="Jarvis Voice Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Sample-Rate"],
)

model: TTSModel | None = None
voice_state = None
generate_lock = threading.Lock()


@app.on_event("startup")
def load_model() -> None:
    global model, voice_state
    model = TTSModel.load_model()
    if VOICE_CACHE.exists():
        voice_state = model.get_state_for_audio_prompt(str(VOICE_CACHE))
    else:
        # first run: clone the voice from the mp3, then cache for fast startups
        voice_state = model.get_state_for_audio_prompt(str(VOICE_MP3))
        export_model_state(voice_state, str(VOICE_CACHE))


class TTSRequest(BaseModel):
    text: str


def clamp_text(text: str) -> str:
    text = text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty text")
    return text[:2000]


@app.get("/health")
def health():
    return {
        "status": "online",
        "voice": "jarvis-clone",
        "model_loaded": model is not None,
        "sample_rate": model.sample_rate if model else None,
    }


@app.post("/tts")
def tts(req: TTSRequest):
    text = clamp_text(req.text)
    # timed acquire so an abandoned stream can never deadlock the server
    if not generate_lock.acquire(timeout=30):
        raise HTTPException(status_code=503, detail="Voice engine busy")
    try:
        audio = model.generate_audio(voice_state, text)
    finally:
        generate_lock.release()
    buf = io.BytesIO()
    scipy.io.wavfile.write(buf, model.sample_rate, audio.numpy())
    return Response(content=buf.getvalue(), media_type="audio/wav")


@app.post("/tts/stream")
def tts_stream(req: TTSRequest):
    text = clamp_text(req.text)

    def pcm_chunks():
        if not generate_lock.acquire(timeout=30):
            return
        try:
            for chunk in model.generate_audio_stream(voice_state, text):
                pcm = np.clip(chunk.numpy(), -1.0, 1.0)
                yield (pcm * 32767.0).astype("<i2").tobytes()
        finally:
            # released even if the client disconnects mid-stream
            generate_lock.release()

    return StreamingResponse(
        pcm_chunks(),
        media_type="application/octet-stream",
        headers={"X-Sample-Rate": str(model.sample_rate)},
    )
