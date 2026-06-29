"""Edit-pipeline corpus tests (M3.5.3 / Workstream D).

Runs the full imported-score edit path — ``list → resolve → /score/edit/* → reload``
— against a corpus of real-world MusicXML shapes (multi-voice ``<backup>``, piano
grand staff, cross-staff, tuplets, guitar ``<technical>``). The point is to keep the
fragile edit pipeline (ADR-0015) honest on the elements Phase 4 will touch, and to
lock the June-27 multi-voice regression.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

FIXTURES = Path(__file__).parent / "fixtures"
FIXTURE_FILES = sorted(FIXTURES.glob("*.musicxml"))


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app())


def _load(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def _pitched(notes: list[dict]) -> list[dict]:
    """Notes that carry a real pitch (drop rests / blanks)."""
    return [n for n in notes if n.get("pitch") and n["pitch"][0] in "ABCDEFG"]


def test_corpus_is_present() -> None:
    # Guard against an empty glob silently making the parametrized test a no-op.
    names = {f.name for f in FIXTURE_FILES}
    assert {
        "multi_voice_backup.musicxml",
        "piano_grand_staff.musicxml",
        "cross_staff.musicxml",
        "tuplets.musicxml",
        "guitar_technical.musicxml",
    } <= names


@pytest.mark.parametrize(
    "fixture", [f.name for f in FIXTURE_FILES], ids=[f.stem for f in FIXTURE_FILES]
)
def test_edit_pipeline_round_trips_over_corpus(client: TestClient, fixture: str) -> None:
    xml = _load(fixture)

    # 1. list — the edit overlay's source of truth. Must not be empty (the June-27 bug).
    listed = client.post("/score/edit/notes/list", json={"musicxml": xml})
    assert listed.status_code == 200, listed.text
    notes = listed.json()["notes"]
    assert notes, f"{fixture}: list_notes returned no notes"

    pitched = _pitched(notes)
    assert pitched, f"{fixture}: no pitched note to edit"
    target = pitched[0]

    # 2. resolve — map (measure, pitch, beat) to authoritative coordinates.
    resolved = client.post(
        "/score/edit/note/resolve",
        json={
            "musicxml": xml,
            "measure_number": target["measure_number"],
            "pitch": target["pitch"],
            "beat_hint": target["beat_offset"],
        },
    )
    assert resolved.status_code == 200, resolved.text
    r = resolved.json()
    assert r["pitch"] == target["pitch"]

    # 3. edit — transpose the resolved note up a semitone.
    edited = client.post(
        "/score/edit/note/transpose-semitones",
        json={
            "musicxml": xml,
            "part_index": r["part_index"],
            "measure_number": r["measure_number"],
            "beat_offset": r["beat_offset"],
            "voice": r["voice"],
            "semitones": 1,
        },
    )
    assert edited.status_code == 200, edited.text
    new_xml = edited.json()["musicxml"]

    # 4. reload — the edited score still parses and lists the same note count.
    relisted = client.post("/score/edit/notes/list", json={"musicxml": new_xml})
    assert relisted.status_code == 200, relisted.text
    assert len(_pitched(relisted.json()["notes"])) == len(pitched), (
        f"{fixture}: pitched-note count changed after edit + reload"
    )


def test_corpus_multi_voice_lists_both_voices(client: TestClient) -> None:
    # The June-27 regression: a <backup> measure must surface BOTH voices.
    notes = client.post(
        "/score/edit/notes/list",
        json={"musicxml": _load("multi_voice_backup.musicxml")},
    ).json()["notes"]
    voices = {n["voice"] for n in notes}
    assert voices != {None}, "multi-voice score should resolve real voice ids"
    assert len(voices) >= 2, f"expected >= 2 voices, got {voices}"


def test_corpus_guitar_technical_is_listable_and_editable(client: TestClient) -> None:
    # The Phase-4 elements: a guitar part with <technical> must list + edit cleanly.
    xml = _load("guitar_technical.musicxml")
    assert "<technical>" in xml

    listed = client.post("/score/edit/notes/list", json={"musicxml": xml})
    assert listed.status_code == 200, listed.text
    notes = _pitched(listed.json()["notes"])
    assert len(notes) == 4, f"expected 4 guitar notes, got {notes}"

    target = notes[0]
    r = client.post(
        "/score/edit/note/resolve",
        json={
            "musicxml": xml,
            "measure_number": target["measure_number"],
            "pitch": target["pitch"],
            "beat_hint": target["beat_offset"],
        },
    ).json()
    edited = client.post(
        "/score/edit/note/transpose-semitones",
        json={
            "musicxml": xml,
            "part_index": r["part_index"],
            "measure_number": r["measure_number"],
            "beat_offset": r["beat_offset"],
            "voice": r["voice"],
            "semitones": 2,
        },
    )
    assert edited.status_code == 200, edited.text
    # The edit path round-trips the score; technical notations on the other notes
    # survive (a Phase-4 precondition — the corpus would flag it if they didn't).
    assert "<technical>" in edited.json()["musicxml"]
