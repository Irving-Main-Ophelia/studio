"""Score-level I/O helpers.

Single place that knows how to round-trip MusicXML through music21. Every
analyser starts here so we never duplicate parsing logic.
"""

from __future__ import annotations

from typing import Any

from music21 import converter, stream, tempo


def parse_score(musicxml: str) -> stream.Score:
    """Parse MusicXML into a music21 Score, wrapping a Part in Score if needed."""
    parsed = converter.parseData(musicxml, format="musicxml")
    if isinstance(parsed, stream.Score):
        return parsed
    wrapped = stream.Score()
    wrapped.insert(0, parsed)  # type: ignore[no-untyped-call]
    return wrapped


def serialise_score(score: stream.Score) -> str:
    """Serialise back to a MusicXML 4.0 string."""
    path = score.write("musicxml")  # type: ignore[no-untyped-call]
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def extract_notes(musicxml: str) -> dict[str, Any]:
    """Return a flat note list + metadata for browser playback."""
    score = parse_score(musicxml)
    tempos = list(score.flatten().getElementsByClass(tempo.MetronomeMark))
    tempo_bpm = float(tempos[0].number) if tempos and tempos[0].number else 90.0
    quarter_sec = 60.0 / tempo_bpm

    notes: list[dict[str, Any]] = []
    parts = list(score.parts) if score.parts else [score]
    max_end = 0.0
    default_velocity = 90
    for part_index, part in enumerate(parts):
        for element in part.flatten().notes:
            start_quarter = float(element.offset)
            dur_quarter = float(element.duration.quarterLength)
            if dur_quarter <= 0:
                continue
            start_sec = start_quarter * quarter_sec
            duration_sec = dur_quarter * quarter_sec
            max_end = max(max_end, start_sec + duration_sec)
            pitches = (
                list(element.pitches) if element.isChord else [element.pitch]  # type: ignore[attr-defined]
            )
            for p in pitches:
                notes.append(
                    {
                        "midi": int(p.midi),
                        "start_sec": round(start_sec, 4),
                        "duration_sec": round(duration_sec, 4),
                        "part_index": part_index,
                        "velocity": default_velocity,
                    }
                )

    notes.sort(key=lambda n: (n["start_sec"], n["midi"]))
    return {
        "tempo_bpm": tempo_bpm,
        "duration_sec": round(max_end, 4),
        "notes": notes,
    }
