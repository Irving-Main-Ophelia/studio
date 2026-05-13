"""Seed Phase-0 MusicXML fixtures.

Outputs are committed alongside the desktop app for the demo flow:
  apps/desktop/public/fixtures/<name>.musicxml

The pieces all live safely in the public domain (Bach, ca. 1720s).
"""

from __future__ import annotations

from pathlib import Path

from music21 import (
    bar,
    chord,
    clef,
    corpus,
    duration,
    instrument,
    key,
    meter,
    metadata,
    note,
    stream,
    tempo,
)

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "apps" / "desktop" / "public" / "fixtures"
FIXTURES_DIR.mkdir(parents=True, exist_ok=True)


def _write(score: stream.Score, name: str) -> None:
    target = FIXTURES_DIR / f"{name}.musicxml"
    tmp = score.write("musicxml")
    Path(tmp).rename(target)
    print(f"  wrote {target.relative_to(Path.cwd())}")


def export_bach_chorale_a() -> None:
    """Bach Chorale BWV 66.6 — the canonical music21 reference fixture."""
    print("• Bach BWV 66.6 — Chorale")
    score = corpus.parse("bach/bwv66.6")
    if score.metadata is None:
        score.metadata = metadata.Metadata()
    score.metadata.title = "Christ unser Herr zum Jordan kam — Chorale (BWV 66.6)"
    score.metadata.composer = "Johann Sebastian Bach"
    _write(score, "bach-chorale-bwv66-6")


def export_bach_chorale_b() -> None:
    """Bach Chorale BWV 1.6 — second four-part chorale fixture for comparison."""
    print("• Bach BWV 1.6 — Chorale")
    score = corpus.parse("bach/bwv1.6")
    if score.metadata is None:
        score.metadata = metadata.Metadata()
    score.metadata.title = "Wie schön leuchtet der Morgenstern — Chorale (BWV 1.6)"
    score.metadata.composer = "Johann Sebastian Bach"
    _write(score, "bach-chorale-bwv1-6")


def _add_note(part: stream.Part, p: str, dur: float, *, dyn: str | None = None) -> None:
    n = note.Note(p)
    n.duration = duration.Duration(quarterLength=dur)
    if dyn:
        n.addLyric(dyn)
    part.append(n)


def _add_chord(part: stream.Part, pitches: list[str], dur: float) -> None:
    c = chord.Chord(pitches)
    c.duration = duration.Duration(quarterLength=dur)
    part.append(c)


def export_rachmaninoff_style_excerpt() -> None:
    """A short 8-bar Andante in C# minor.

    Not a real Rachmaninoff piece — we cannot ship one in the public-domain
    safely without confirming each opus's status. This is a *flavored* excerpt
    written for demo purposes: dense piano texture, chromatic descending bass,
    arpeggiated upper voice, a modulation to the relative E major.
    """
    print("• Andante in C# minor (Rachmaninoff-flavored, original)")
    score = stream.Score()
    score.metadata = metadata.Metadata()
    score.metadata.title = "Andante in C# minor"
    score.metadata.composer = "Stockhausen demo fixture"

    rh = stream.Part()
    rh.insert(0, instrument.Piano())
    rh.append(clef.TrebleClef())
    rh.append(key.KeySignature(4))  # 4 sharps = C# minor / E major
    rh.append(meter.TimeSignature("4/4"))
    rh.append(tempo.MetronomeMark("Andante", 76))

    lh = stream.Part()
    lh.insert(0, instrument.Piano())
    lh.append(clef.BassClef())
    lh.append(key.KeySignature(4))
    lh.append(meter.TimeSignature("4/4"))

    # Bar 1 — C# minor
    _add_chord(rh, ["C#5", "E5", "G#5"], 1.0)
    _add_chord(rh, ["C#5", "E5", "G#5"], 1.0)
    _add_chord(rh, ["B4", "D#5", "G#5"], 1.0)
    _add_chord(rh, ["B4", "D#5", "F##5"], 1.0)
    _add_note(lh, "C#3", 2.0)
    _add_note(lh, "B2", 2.0)

    # Bar 2 — descending chromatic bass
    _add_chord(rh, ["A4", "C#5", "E5"], 1.0)
    _add_chord(rh, ["A4", "C#5", "F#5"], 1.0)
    _add_chord(rh, ["G#4", "B4", "E5"], 1.0)
    _add_chord(rh, ["G#4", "B4", "D#5"], 1.0)
    _add_note(lh, "A2", 2.0)
    _add_note(lh, "G#2", 2.0)

    # Bar 3 — half cadence to G# (dominant of C#m)
    _add_chord(rh, ["F#4", "A4", "D#5"], 1.0)
    _add_chord(rh, ["F#4", "A4", "C#5"], 1.0)
    _add_chord(rh, ["E#4", "G#4", "B4"], 1.0)
    _add_chord(rh, ["F#4", "G#4", "C#5"], 1.0)
    _add_note(lh, "F#2", 2.0)
    _add_note(lh, "G#2", 2.0)

    # Bar 4 — V7 of C#m → back to i
    _add_chord(rh, ["G#4", "B#4", "D#5", "F#5"], 2.0)
    _add_chord(rh, ["C#5", "E5", "G#5"], 2.0)
    _add_note(lh, "G#2", 2.0)
    _add_note(lh, "C#3", 2.0)

    # Bar 5 — modulation pivot to E major (relative)
    _add_chord(rh, ["A4", "C#5", "E5"], 1.0)
    _add_chord(rh, ["G#4", "B4", "E5"], 1.0)
    _add_chord(rh, ["F#4", "A4", "D5"], 1.0)
    _add_chord(rh, ["F#4", "A4", "B4"], 1.0)
    _add_note(lh, "A2", 2.0)
    _add_note(lh, "B2", 2.0)

    # Bar 6 — V7 of E
    _add_chord(rh, ["G#4", "B4", "D5", "E5"], 2.0)
    _add_chord(rh, ["G#4", "B4", "E5"], 2.0)
    _add_note(lh, "B2", 4.0)

    # Bar 7 — I in E
    _add_chord(rh, ["E5", "G#5", "B5"], 1.0)
    _add_chord(rh, ["E5", "G#5", "B5"], 1.0)
    _add_chord(rh, ["D#5", "F#5", "B5"], 1.0)
    _add_chord(rh, ["D#5", "F#5", "A5"], 1.0)
    _add_note(lh, "E2", 2.0)
    _add_note(lh, "B2", 2.0)

    # Bar 8 — cadence back to C# minor (deceptive moment, then half cadence)
    _add_chord(rh, ["C#5", "E5", "A5"], 2.0)
    _add_chord(rh, ["B#4", "D#5", "G#5"], 2.0)
    _add_note(lh, "A2", 2.0)
    _add_note(lh, "G#2", 2.0)

    final_bar_rh = rh.measure(8) or rh
    final_bar_lh = lh.measure(8) or lh
    final_bar_rh.append(bar.Barline("final"))
    final_bar_lh.append(bar.Barline("final"))

    score.insert(0, rh)
    score.insert(0, lh)

    _write(score, "andante-c-sharp-minor")


def main() -> None:
    print(f"Seeding fixtures into {FIXTURES_DIR}")
    export_bach_chorale_a()
    export_bach_chorale_b()
    export_rachmaninoff_style_excerpt()
    print("Done.")


if __name__ == "__main__":
    main()
