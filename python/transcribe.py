#!/usr/bin/env python3
"""
transcribe.py — Parakeet TDT v3 (NeMo ASR) transcription script.

Usage:
    python transcribe.py --input <audio_path> --output <json_path> [--model <model_name>]

Output (stdout, one JSON object per line):
    {"type": "progress", "stage": "loading-model", "message": "Loading Parakeet TDT v3..."}
    {"type": "progress", "stage": "transcribing", "message": "Transcribing audio..."}
    {"type": "done", "text": "...", "words": [...], "segments": [...]}

On error:
    {"type": "error", "message": "details"}
"""

import argparse
import json
import sys
import os
import tempfile


# ---------------------------------------------------------------------------
# stdout discipline
# ---------------------------------------------------------------------------
#
# The Electron main process parses our stdout line-by-line as JSON. NeMo /
# PyTorch / lightning / huggingface routinely print to stdout (info logs, YAML
# config dumps, tqdm progress with \r) which corrupts the stream and breaks
# JSON.parse on the Node side — in particular the final {"type":"done",...}
# line can end up smushed against a tqdm progress fragment via a carriage
# return and never reach the renderer.
#
# To keep stdout clean we keep a private handle to the original stdout file
# descriptor and redirect Python's stdout (fd 1) to stderr. Only `emit()`
# writes to the saved handle, guaranteeing every byte on real stdout is a
# complete line of JSON.
_REAL_STDOUT = os.fdopen(os.dup(1), "w", buffering=1, encoding="utf-8", errors="replace")
try:
    os.dup2(2, 1)  # redirect fd 1 -> fd 2 (stderr)
    sys.stdout = os.fdopen(1, "w", buffering=1, encoding="utf-8", errors="replace")
except Exception:
    # Best effort — if redirection fails (rare), we'll still emit() to the
    # original stdout, just with possible NeMo log pollution alongside it.
    pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def emit(obj: dict) -> None:
    """Emit a JSON line on the *original* stdout (flushed immediately).

    Library logs and tqdm output go to stderr via the redirection above, so
    Node's stdout reader only ever sees one complete JSON object per line.
    """
    _REAL_STDOUT.write(json.dumps(obj) + "\n")
    _REAL_STDOUT.flush()


def emit_progress(stage: str, message: str) -> None:
    emit({"type": "progress", "stage": stage, "message": message})


def emit_error(message: str) -> None:
    emit({"type": "error", "message": message})


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Transcribe audio with Parakeet TDT v3")
    parser.add_argument("--input", required=True, help="Path to input audio file (.wav or .flac)")
    parser.add_argument(
        "--model",
        default="nvidia/parakeet-tdt-0.6b-v3",
        help="NeMo model name (default: nvidia/parakeet-tdt-0.6b-v3)",
    )
    parser.add_argument("--output", required=True, help="Path to write output JSON")
    return parser.parse_args()


def write_output(path: str, data: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ---------------------------------------------------------------------------
# Audio duration helper (uses stdlib wave for WAV files)
# ---------------------------------------------------------------------------

def get_audio_duration_seconds(audio_path: str) -> float:
    """Return duration in seconds. Works for WAV via stdlib; fallback returns 0."""
    try:
        import wave
        with wave.open(audio_path, "rb") as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            return frames / float(rate)
    except Exception:
        return 0.0


# ---------------------------------------------------------------------------
# Chunked transcription for audio > 24 minutes
# ---------------------------------------------------------------------------

MAX_FULL_ATTENTION_SECONDS = 5 * 60   # 300 s — conservative to avoid CUDA OOM on 11 GB GPUs
CHUNK_SECONDS = 5 * 60               # 5 min per chunk (safe for ≤11 GB VRAM)
OVERLAP_SECONDS = 10                 # 10 s overlap between chunks


def _chunk_audio_ffmpeg(audio_path: str, start: float, duration: float, out_path: str) -> bool:
    """Extract a slice of audio using ffmpeg."""
    import subprocess
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start),
        "-t", str(duration),
        "-i", audio_path,
        "-ar", "16000",
        "-ac", "1",
        out_path,
    ]
    result = subprocess.run(cmd, capture_output=True)
    return result.returncode == 0


# Per-chunk subprocess timeout: 30 min. Covers cold model load (~30–120 s),
# optional CPU fallback (5-min chunk on CPU ≈ 8–15 min), plus headroom. The old
# 10-min ceiling was too tight when PyTorch was CPU-only in the packaged venv.
CHUNK_SUBPROCESS_TIMEOUT = 30 * 60


def _transcribe_chunk_subprocess(
    chunk_path: str, model_name: str, output_json: str, chunk_label: str = ""
) -> "tuple[dict | None, str | None]":
    """Transcribe a single chunk in an isolated subprocess to avoid CUDA OOM accumulation.

    NeMo's Parakeet model leaks GPU memory across successive transcribe() calls in the
    same process, eventually causing an unrecoverable CUDA abort.  Running each chunk in
    its own subprocess guarantees the GPU is fully released between chunks.

    Progress emitted by the worker on stdout is streamed back and re-emitted on this
    script's stdout so the Electron renderer gets live feedback during the minutes-long
    chunk work (instead of a silent UI until timeout).
    """
    import subprocess
    import threading
    import queue
    import time

    python_bin = sys.executable
    prefix = f"{chunk_label}: " if chunk_label else ""

    # Mini-script that loads the model, transcribes one file, writes JSON result,
    # and emits structured progress on stdout so the parent can surface it.
    worker_code = f"""
import os, sys, json
os.environ['NEMO_LOGGING_LEVEL'] = 'ERROR'
import logging
logging.getLogger('nemo_logger').setLevel(logging.ERROR)
logging.getLogger('nemo').setLevel(logging.ERROR)

def _emit(msg):
    print(json.dumps({{'type': 'progress', 'stage': 'transcribing', 'message': msg}}), flush=True)

_emit('loading model')
import nemo.collections.asr as nemo_asr
model = nemo_asr.models.ASRModel.from_pretrained(model_name={model_name!r})
model.eval()

import torch
_device = 'cpu'
if torch.cuda.is_available():
    try:
        model = model.cuda()
        _device = 'cuda'
        _emit(f'model on GPU ({{torch.cuda.get_device_name(0)}})')
    except Exception as _gpu_err:
        _emit(f'GPU move failed ({{_gpu_err}}) — using CPU')
else:
    _emit('CUDA unavailable — using CPU (transcription will be slow)')

_emit('transcribing chunk')
output = model.transcribe([{chunk_path!r}], timestamps=True, batch_size=1, num_workers=0)
result = output[0]
words = [dict(text=w.get('word',''), start=float(w.get('start',0)), end=float(w.get('end',0)))
         for w in (result.timestamp.get('word', []) if hasattr(result, 'timestamp') else [])]
segments = [dict(text=s.get('segment',''), start=float(s.get('start',0)), end=float(s.get('end',0)))
            for s in (result.timestamp.get('segment', []) if hasattr(result, 'timestamp') else [])]
payload = dict(text=result.text.strip(), words=words, segments=segments)
with open({output_json!r}, 'w') as f:
    json.dump(payload, f)
_emit(f'chunk done ({{len(words)}} words, device={{_device}})')
"""

    proc = subprocess.Popen(
        [python_bin, "-c", worker_code],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )

    def _drain(stream, q):
        try:
            for line in iter(stream.readline, ""):
                q.put(line)
        finally:
            try:
                stream.close()
            except Exception:
                pass
            q.put(None)  # sentinel

    out_q: queue.Queue = queue.Queue()
    err_q: queue.Queue = queue.Queue()
    threading.Thread(target=_drain, args=(proc.stdout, out_q), daemon=True).start()
    threading.Thread(target=_drain, args=(proc.stderr, err_q), daemon=True).start()

    start = time.time()
    stderr_chunks: list = []
    out_done = False
    err_done = False

    while not (out_done and err_done):
        if time.time() - start > CHUNK_SUBPROCESS_TIMEOUT:
            proc.kill()
            try:
                proc.wait(timeout=5)
            except Exception:
                pass
            return None, f"timeout after {CHUNK_SUBPROCESS_TIMEOUT}s"

        # Poll both queues with a short timeout so we can re-check the wall clock.
        try:
            line = out_q.get(timeout=0.25)
            if line is None:
                out_done = True
            else:
                stripped = line.strip()
                if stripped:
                    try:
                        obj = json.loads(stripped)
                        if isinstance(obj, dict) and obj.get("type") == "progress":
                            emit_progress(
                                obj.get("stage", "transcribing"),
                                f"{prefix}{obj.get('message', '')}",
                            )
                    except (json.JSONDecodeError, ValueError):
                        pass
        except queue.Empty:
            pass

        try:
            eline = err_q.get_nowait()
            if eline is None:
                err_done = True
            else:
                stderr_chunks.append(eline)
        except queue.Empty:
            pass

    returncode = proc.wait()
    if returncode != 0:
        stderr_tail = ("".join(stderr_chunks))[-500:]
        return None, f"exit {returncode}: {stderr_tail}"

    try:
        with open(output_json, "r") as f:
            return json.load(f), None
    except Exception as e:
        return None, f"could not read output: {e}"


def transcribe_chunked(model_name: str, audio_path: str, duration_sec: float) -> dict:
    """Split audio into overlapping chunks, transcribe each in a subprocess, merge results.

    Each chunk runs in its own process to avoid NeMo/CUDA memory accumulation that causes
    unrecoverable GPU aborts on cards with ≤12 GB VRAM.
    """
    emit_progress("transcribing", f"Audio is {duration_sec/60:.1f} min — using chunked transcription (subprocess per chunk)")

    chunks = []
    start = 0.0
    while start < duration_sec:
        end = min(start + CHUNK_SECONDS, duration_sec)
        chunks.append((start, end - start))
        if end >= duration_sec:
            break
        start = end - OVERLAP_SECONDS  # back up by overlap

    all_words: list = []
    all_segments: list = []
    full_text_parts: list = []

    tmp_dir = tempfile.mkdtemp()

    for i, (chunk_start, chunk_dur) in enumerate(chunks):
        emit_progress(
            "transcribing",
            f"Transcribing chunk {i + 1}/{len(chunks)} "
            f"({chunk_start/60:.1f}–{(chunk_start + chunk_dur)/60:.1f} min)..."
        )
        chunk_path = os.path.join(tmp_dir, f"chunk_{i}.wav")
        chunk_json = os.path.join(tmp_dir, f"chunk_{i}.json")

        if not _chunk_audio_ffmpeg(audio_path, chunk_start, chunk_dur, chunk_path):
            emit_progress("transcribing", f"Warning: failed to extract chunk {i + 1} audio")
            continue

        chunk_label = f"chunk {i + 1}/{len(chunks)}"
        result, err = _transcribe_chunk_subprocess(
            chunk_path, model_name, chunk_json, chunk_label
        )

        # Cleanup temp files
        for f in (chunk_path, chunk_json):
            try:
                os.remove(f)
            except Exception:
                pass

        if result is None:
            emit_progress("transcribing", f"Warning: chunk {i + 1} failed: {err}")
            continue

        for w in result.get("words", []):
            word_start = float(w.get("start", 0.0)) + chunk_start
            word_end = float(w.get("end", 0.0)) + chunk_start
            # Skip words already covered by previous chunk (overlap zone)
            if i > 0 and word_start < (chunk_start + OVERLAP_SECONDS):
                continue
            all_words.append({
                "text": w.get("text", ""),
                "start": round(word_start, 3),
                "end": round(word_end, 3),
            })

        for s in result.get("segments", []):
            seg_start = float(s.get("start", 0.0)) + chunk_start
            seg_end = float(s.get("end", 0.0)) + chunk_start
            if i > 0 and seg_start < (chunk_start + OVERLAP_SECONDS):
                continue
            all_segments.append({
                "text": s.get("text", ""),
                "start": round(seg_start, 3),
                "end": round(seg_end, 3),
            })

        full_text_parts.append(result.get("text", ""))

    try:
        import shutil
        shutil.rmtree(tmp_dir, ignore_errors=True)
    except Exception:
        pass

    return {
        "text": " ".join(full_text_parts),
        "words": all_words,
        "segments": all_segments,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    args = parse_args()

    if not os.path.isfile(args.input):
        emit_error(f"Input file not found: {args.input}")
        write_output(args.output, {"error": f"Input file not found: {args.input}"})
        sys.exit(1)

    # Suppress NeMo / PyTorch verbose logging
    import logging
    logging.getLogger("nemo_logger").setLevel(logging.ERROR)
    logging.getLogger("nemo").setLevel(logging.ERROR)
    os.environ.setdefault("NEMO_LOGGING_LEVEL", "ERROR")

    try:
        import nemo.collections.asr as nemo_asr
    except ImportError as e:
        emit_error(f"NeMo not installed: {e}")
        write_output(args.output, {"error": f"NeMo not installed: {e}"})
        sys.exit(1)

    # Check if the model is already cached; if not, we'll see download progress
    try:
        from huggingface_hub import try_to_load_from_cache, snapshot_download
        import re as _re

        # Determine if model is cached by checking the hub cache
        _model_id = args.model.replace("/", "--") if "/" in args.model else args.model
        _cache_hit = try_to_load_from_cache(args.model, filename="model_config.yaml") is not None
    except Exception:
        _cache_hit = True  # Assume cached if we can't check (avoid false download message)

    if not _cache_hit:
        emit({"type": "progress", "stage": "downloading-model",
              "message": "Downloading Parakeet TDT v3 (~1.2 GB) — first time only...",
              "percent": 0})
        # Patch tqdm to emit download progress lines
        try:
            import tqdm as _tqdm_mod

            _orig_tqdm_init = _tqdm_mod.tqdm.__init__

            def _patched_tqdm_init(self, *args, **kwargs):
                _orig_tqdm_init(self, *args, **kwargs)

            _orig_tqdm_update = _tqdm_mod.tqdm.update

            def _patched_tqdm_update(self, n=1):
                _orig_tqdm_update(self, n)
                try:
                    total = self.total or 1
                    pct = min(99, int((self.n / total) * 100))
                    desc = str(self.desc or "")
                    emit({"type": "progress", "stage": "downloading-model",
                          "message": f"Downloading Parakeet TDT v3 ({desc.strip()})...",
                          "percent": pct})
                except Exception:
                    pass

            _tqdm_mod.tqdm.update = _patched_tqdm_update
        except Exception:
            pass  # tqdm not available or patch failed — no progress, that's fine
    else:
        emit_progress("loading-model", f"Loading Parakeet TDT v3 ({args.model})...")

    try:
        asr_model = nemo_asr.models.ASRModel.from_pretrained(model_name=args.model)
        asr_model.eval()
    except Exception as e:
        emit_error(f"Failed to load model '{args.model}': {e}")
        write_output(args.output, {"error": f"Failed to load model: {e}"})
        sys.exit(1)

    # Report device info and move model to GPU if available
    import torch
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'N/A'
    emit_progress("loading-model", f"Model loaded on {device.upper()}" + (f" ({gpu_name})" if device == 'cuda' else " (no CUDA available)"))

    # Move model to GPU if available
    if torch.cuda.is_available():
        try:
            asr_model = asr_model.cuda()
            emit_progress("loading-model", f"Model moved to GPU: {gpu_name}")
        except Exception as e:
            emit_progress("loading-model", f"GPU move failed, using CPU: {e}")

    # Signal that model is loaded (after potential download)
    emit({"type": "progress", "stage": "loading-model",
          "message": f"Model loaded successfully"})

    duration_sec = get_audio_duration_seconds(args.input)
    if torch.cuda.is_available():
        emit_progress("transcribing", f"Transcribing on GPU ({torch.cuda.get_device_name(0)})...")
    else:
        emit_progress("transcribing", f"Transcribing on CPU (install CUDA PyTorch for 10-50x speedup)...")
    emit_progress("transcribing", f"Transcribing audio ({duration_sec/60:.1f} min)...")

    try:
        if duration_sec > MAX_FULL_ATTENTION_SECONDS:
            payload = transcribe_chunked(args.model, args.input, duration_sec)
        else:
            try:
                output = asr_model.transcribe([args.input], timestamps=True, batch_size=1, num_workers=0)
            except RuntimeError as oom_err:
                if "out of memory" in str(oom_err).lower():
                    # CUDA OOM — clear cache and fall back to chunked transcription
                    emit_progress("transcribing", "GPU out of memory — falling back to chunked transcription...")
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                    payload = transcribe_chunked(args.model, args.input, duration_sec)
                else:
                    raise
            else:
                result = output[0]
                full_text: str = result.text

                raw_words = result.timestamp.get("word", []) if hasattr(result, "timestamp") else []
                words = []
                for w in raw_words:
                    words.append({
                        "text": w.get("word", ""),
                        "start": round(float(w.get("start", 0.0)), 3),
                        "end": round(float(w.get("end", 0.0)), 3),
                    })

                raw_segments = result.timestamp.get("segment", []) if hasattr(result, "timestamp") else []
                segments = []
                for s in raw_segments:
                    segments.append({
                        "text": s.get("segment", ""),
                        "start": round(float(s.get("start", 0.0)), 3),
                        "end": round(float(s.get("end", 0.0)), 3),
                    })

                payload = {
                    "text": full_text,
                    "words": words,
                    "segments": segments,
                }
    except Exception as e:
        emit_error(f"Transcription failed: {e}")
        write_output(args.output, {"error": f"Transcription failed: {e}"})
        sys.exit(1)

    write_output(args.output, payload)

    # Emit the final done line with full payload
    emit({
        "type": "done",
        "text": payload["text"],
        "words": payload["words"],
        "segments": payload["segments"],
    })


if __name__ == "__main__":
    main()
