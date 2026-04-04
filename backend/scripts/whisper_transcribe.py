#!/usr/bin/env python3
"""
Whisper STT transcription script for NEON.
Uses faster-whisper for efficient local speech-to-text.
Usage: python whisper_transcribe.py <audio_file> [--language de]
Output: JSON with { text, language, duration }
"""

import sys
import json
import os

def transcribe(audio_path: str, language: str = "de"):
    from faster_whisper import WhisperModel

    # Use small model for speed, can be changed to medium/large for accuracy
    model_size = os.environ.get("WHISPER_MODEL", "base")

    model = WhisperModel(model_size, device="cpu", compute_type="int8")

    segments, info = model.transcribe(audio_path, language=language, beam_size=5)

    text_parts = []
    for segment in segments:
        text_parts.append(segment.text.strip())

    result = {
        "text": " ".join(text_parts),
        "language": info.language,
        "duration": round(info.duration, 2),
        "model": model_size,
    }

    print(json.dumps(result, ensure_ascii=False))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No audio file provided"}))
        sys.exit(1)

    audio_file = sys.argv[1]
    lang = "de"

    for i, arg in enumerate(sys.argv):
        if arg == "--language" and i + 1 < len(sys.argv):
            lang = sys.argv[i + 1]

    if not os.path.exists(audio_file):
        print(json.dumps({"error": f"File not found: {audio_file}"}))
        sys.exit(1)

    transcribe(audio_file, lang)
