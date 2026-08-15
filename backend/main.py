import imaplib
import io
import json
import os
import re
import threading
from email import message_from_bytes
from email.header import decode_header, make_header
from email.utils import parsedate_to_datetime
from pathlib import Path

import numpy as np
import scipy.io.wavfile
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from pocket_tts import TTSModel, export_model_state

# load backend/.env (KEY=VALUE lines) without adding a dependency
_ENV_FILE = Path(__file__).parent / ".env"
if _ENV_FILE.exists():
    for _line in _ENV_FILE.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip())

VOICE_DIR = Path(__file__).parent / "voice"
VOICE_MP3 = VOICE_DIR / "jarvis-clone.mp3"
VOICE_CACHE = VOICE_DIR / "jarvis-clone.safetensors"
# big model for command accuracy, small model for the cheap always-on wake stream
VOSK_BIG = Path(__file__).parent / "models" / "vosk-en-lgraph"
VOSK_SMALL = Path(__file__).parent / "models" / "vosk-small-en"

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
vosk_model = None
vosk_wake_model = None
whisper_model = None
_whisper_lock = threading.Lock()
WHISPER_NAME = os.environ.get("JARVIS_WHISPER_MODEL", "small.en")


def _get_whisper():
    global whisper_model
    with _whisper_lock:
        if whisper_model is None:
            from faster_whisper import WhisperModel

            whisper_model = WhisperModel(WHISPER_NAME, device="cpu", compute_type="int8")
    return whisper_model


@app.on_event("startup")
def load_model() -> None:
    global model, voice_state, vosk_model, vosk_wake_model
    model = TTSModel.load_model()
    if VOICE_CACHE.exists():
        voice_state = model.get_state_for_audio_prompt(str(VOICE_CACHE))
    else:
        # first run: clone the voice from the mp3, then cache for fast startups
        voice_state = model.get_state_for_audio_prompt(str(VOICE_MP3))
        export_model_state(voice_state, str(VOICE_CACHE))
    from vosk import Model as VoskModel

    if VOSK_BIG.exists():
        vosk_model = VoskModel(str(VOSK_BIG))
    if VOSK_SMALL.exists():
        vosk_wake_model = VoskModel(str(VOSK_SMALL))
    if vosk_model is None:
        vosk_model = vosk_wake_model
    if vosk_wake_model is None:
        vosk_wake_model = vosk_model
    # warm whisper in the background so the first command isn't slow
    threading.Thread(target=_get_whisper, daemon=True).start()


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
        "stt": vosk_model is not None,
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


_stt_sessions = 0


@app.websocket("/stt/ws")
async def stt_ws(ws: WebSocket, mode: str = "command"):
    """Streaming speech-to-text: client sends 16kHz mono 16-bit PCM chunks,
    server answers with partial/final transcripts (offline vosk).
    mode=wake uses the light model so the always-on stream stays cheap."""
    global _stt_sessions
    await ws.accept()
    engine = vosk_wake_model if mode == "wake" else vosk_model
    if engine is None or _stt_sessions >= 3:  # stale reconnects must not pile up CPU
        await ws.close(code=1013)
        return
    from starlette.concurrency import run_in_threadpool
    from vosk import KaldiRecognizer

    rec = KaldiRecognizer(engine, 16000)
    _stt_sessions += 1
    try:
        while True:
            data = await ws.receive_bytes()
            # decode off the event loop so TTS requests never wait behind recognition
            accepted = await run_in_threadpool(rec.AcceptWaveform, data)
            if accepted:
                text = json.loads(rec.Result()).get("text", "")
                if text:
                    await ws.send_json({"type": "final", "text": text})
            else:
                partial = json.loads(rec.PartialResult()).get("partial", "")
                if partial:
                    await ws.send_json({"type": "partial", "text": partial})
    except WebSocketDisconnect:
        pass
    finally:
        _stt_sessions -= 1


@app.websocket("/wake/ws")
async def wake_ws(ws: WebSocket):
    """Dedicated hotword stream: 16kHz int16 PCM in, {"type":"wake"} out when
    the pretrained openWakeWord 'hey jarvis' detector fires."""
    await ws.accept()
    from starlette.concurrency import run_in_threadpool

    try:
        from openwakeword.model import Model as OWWModel

        detector = await run_in_threadpool(
            lambda: OWWModel(wakeword_models=["hey_jarvis_v0.1"], inference_framework="onnx")
        )
    except Exception:
        await ws.close(code=1011)
        return

    buf = np.zeros(0, dtype=np.int16)
    cooldown_until = 0.0
    import time as _time

    try:
        while True:
            data = await ws.receive_bytes()
            buf = np.concatenate([buf, np.frombuffer(data, dtype=np.int16)])
            while len(buf) >= 1280:  # 80ms frames, as the detector expects
                frame, buf = buf[:1280], buf[1280:]
                scores = await run_in_threadpool(detector.predict, frame)
                if max(scores.values()) > 0.5 and _time.time() > cooldown_until:
                    cooldown_until = _time.time() + 2.0
                    detector.reset()
                    buf = np.zeros(0, dtype=np.int16)
                    await ws.send_json({"type": "wake"})
                    break
    except WebSocketDisconnect:
        pass


@app.post("/stt/transcribe")
async def stt_transcribe(request: Request):
    """Whole-utterance transcription (whisper): body is raw 16kHz mono int16 PCM."""
    from starlette.concurrency import run_in_threadpool

    body = await request.body()
    if len(body) < 8000:  # under ~0.25s of audio
        return {"text": ""}
    audio = np.frombuffer(body, dtype=np.int16).astype(np.float32) / 32768.0

    def _run() -> str:
        engine = _get_whisper()
        segments, _info = engine.transcribe(audio, language="en", beam_size=1, vad_filter=True)
        return " ".join(s.text.strip() for s in segments).strip()

    return {"text": await run_in_threadpool(_run)}


@app.get("/search")
def web_search(q: str, max_results: int = 5):
    """Keyless live web search (DuckDuckGo) with one retry for transient throttles."""
    q = q.strip()[:200]
    if not q:
        raise HTTPException(status_code=400, detail="Empty query")
    from ddgs import DDGS

    last_exc: Exception | None = None
    for attempt in range(2):
        try:
            results = DDGS().text(q, max_results=min(max_results, 8))
            return {
                "results": [
                    {"title": r.get("title", ""), "url": r.get("href", ""), "snippet": r.get("body", "")[:300]}
                    for r in results
                ]
            }
        except Exception as exc:  # network/rate-limit — retry once, then report
            last_exc = exc
            if attempt == 0:
                import time

                time.sleep(1.5)
    raise HTTPException(status_code=502, detail=f"Search failed: {last_exc}")


# ---- Gmail via IMAP (read-only, app password from backend/.env) ----------

IMAP_HOST = "imap.gmail.com"
_mail_fail_until = 0.0  # cooldown after a failed login so we don't hammer Google


def _mail_creds() -> tuple[str, str] | None:
    addr = os.environ.get("GMAIL_ADDRESS", "").strip()
    pw = os.environ.get("GMAIL_APP_PASSWORD", "").replace(" ", "").strip()
    return (addr, pw) if addr and pw else None


def _imap() -> imaplib.IMAP4_SSL:
    global _mail_fail_until
    import time as _time

    creds = _mail_creds()
    if not creds:
        raise HTTPException(status_code=503, detail="Mail not configured")
    if _time.time() < _mail_fail_until:
        raise HTTPException(status_code=503, detail="Mail login failing — retrying later")
    try:
        conn = imaplib.IMAP4_SSL(IMAP_HOST, timeout=10)
        conn.login(*creds)
        return conn
    except (imaplib.IMAP4.error, OSError) as exc:
        _mail_fail_until = _time.time() + 600  # 10 min cooldown
        raise HTTPException(status_code=502, detail=f"IMAP login failed: {exc}") from exc


def _decode(value: str | None) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except Exception:
        return value


def _body_text(msg) -> str:
    parts = msg.walk() if msg.is_multipart() else [msg]
    html = None
    for part in parts:
        ctype = part.get_content_type()
        if ctype == "text/plain":
            try:
                return part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", "replace")
            except Exception:
                continue
        if ctype == "text/html" and html is None:
            try:
                html = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", "replace")
            except Exception:
                continue
    if html:
        text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.S | re.I)
        text = re.sub(r"<[^>]+>", " ", text)
        return re.sub(r"\s{2,}", " ", text).strip()
    return ""


@app.get("/mail/status")
def mail_status():
    if not _mail_creds():
        return {"configured": False, "unread": 0}
    conn = _imap()
    try:
        status, data = conn.status("INBOX", "(UNSEEN)")
        unread = int(re.search(rb"UNSEEN (\d+)", data[0]).group(1)) if status == "OK" else 0
        return {"configured": True, "unread": unread}
    finally:
        conn.logout()


@app.get("/mail/inbox")
def mail_inbox(limit: int = 20):
    conn = _imap()
    try:
        conn.select("INBOX", readonly=True)
        status, data = conn.uid("search", None, "ALL")
        if status != "OK":
            raise HTTPException(status_code=502, detail="IMAP search failed")
        uids = data[0].split()[-limit:]
        if not uids:
            return {"messages": []}
        status, fetched = conn.uid(
            "fetch", b",".join(uids), "(FLAGS BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])"
        )
        if status != "OK":
            raise HTTPException(status_code=502, detail="IMAP fetch failed")
        messages = []
        i = 0
        while i < len(fetched):
            item = fetched[i]
            if isinstance(item, tuple):
                meta = item[0].decode(errors="replace")
                msg = message_from_bytes(item[1])
                uid_m = re.search(r"UID (\d+)", meta)
                try:
                    ts = parsedate_to_datetime(msg.get("Date")).timestamp() * 1000
                except Exception:
                    ts = 0
                messages.append(
                    {
                        "uid": uid_m.group(1) if uid_m else "",
                        "sender": _decode(msg.get("From")),
                        "subject": _decode(msg.get("Subject")) or "(no subject)",
                        "ts": ts,
                        "unread": b"\\Seen" not in item[0],
                    }
                )
            i += 1
        messages.sort(key=lambda m: m["ts"], reverse=True)
        return {"messages": messages}
    finally:
        conn.logout()


@app.get("/mail/message/{uid}")
def mail_message(uid: str):
    if not uid.isdigit():
        raise HTTPException(status_code=400, detail="Bad uid")
    conn = _imap()
    try:
        conn.select("INBOX", readonly=True)
        status, data = conn.uid("fetch", uid, "(BODY.PEEK[])")
        if status != "OK" or not data or not isinstance(data[0], tuple):
            raise HTTPException(status_code=404, detail="Message not found")
        msg = message_from_bytes(data[0][1])
        try:
            ts = parsedate_to_datetime(msg.get("Date")).timestamp() * 1000
        except Exception:
            ts = 0
        return {
            "uid": uid,
            "sender": _decode(msg.get("From")),
            "subject": _decode(msg.get("Subject")) or "(no subject)",
            "ts": ts,
            "body": _body_text(msg)[:20000],
        }
    finally:
        conn.logout()
