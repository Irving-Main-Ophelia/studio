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
        "guitar_hopo_bend.musicxml",
    } <= names


def _resolve(client: TestClient, xml: str, note: dict) -> dict:
    return client.post(
        "/score/edit/note/resolve",
        json={
            "musicxml": xml,
            "measure_number": note["measure_number"],
            "pitch": note["pitch"],
            "beat_hint": note["beat_offset"],
        },
    ).json()


def _guitar_notes(client: TestClient, xml: str) -> list[dict]:
    listed = client.post("/score/edit/notes/list", json={"musicxml": xml})
    assert listed.status_code == 200, listed.text
    return _pitched(listed.json()["notes"])


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


# ── M4.1 (A2) guitar technique edits — bend + hammer-on/pull-off (ADR-0020) ──


def test_set_bend_round_trips(client: TestClient) -> None:
    xml = _load("guitar_hopo_bend.musicxml")
    notes = _guitar_notes(client, xml)
    assert len(notes) == 4
    target = _resolve(client, xml, notes[0])

    # Add a whole-step bend.
    added = client.post(
        "/score/edit/technical/bend",
        json={
            "musicxml": xml,
            "part_index": target["part_index"],
            "measure_number": target["measure_number"],
            "beat_offset": target["beat_offset"],
            "voice": target["voice"],
            "bend_alter": 2,
        },
    )
    assert added.status_code == 200, added.text
    assert added.json()["action"] == "added"
    bent_xml = added.json()["musicxml"]
    assert "<bend>" in bent_xml
    assert "<bend-alter>2" in bent_xml

    # The bent score still lists the same notes (round-trips cleanly).
    assert len(_guitar_notes(client, bent_xml)) == 4

    # Removing it (bend_alter=0) drops the <bend> and reports removed.
    removed = client.post(
        "/score/edit/technical/bend",
        json={
            "musicxml": bent_xml,
            "part_index": target["part_index"],
            "measure_number": target["measure_number"],
            "beat_offset": target["beat_offset"],
            "voice": target["voice"],
            "bend_alter": 0,
        },
    )
    assert removed.status_code == 200, removed.text
    assert removed.json()["action"] == "removed"
    assert "<bend>" not in removed.json()["musicxml"]


@pytest.mark.parametrize("technique", ["hammer_on", "pull_off"])
def test_connective_technique_round_trips(client: TestClient, technique: str) -> None:
    xml = _load("guitar_hopo_bend.musicxml")
    notes = _guitar_notes(client, xml)
    tag = technique.replace("_", "-")
    start = _resolve(client, xml, notes[0])

    added = client.post(
        "/score/edit/technical/connect",
        json={
            "musicxml": xml,
            "part_index": start["part_index"],
            "measure_number": start["measure_number"],
            "beat_offset": start["beat_offset"],
            "voice": start["voice"],
            "technique": technique,
            "action": "set",
        },
    )
    assert added.status_code == 200, added.text
    assert added.json()["action"] == "added"
    connected_xml = added.json()["musicxml"]
    # A start/stop pair was written across the first two notes.
    assert f'<{tag} ' in connected_xml or f"<{tag}>" in connected_xml
    assert connected_xml.count(tag) >= 2
    assert len(_guitar_notes(client, connected_xml)) == 4

    removed = client.post(
        "/score/edit/technical/connect",
        json={
            "musicxml": connected_xml,
            "part_index": start["part_index"],
            "measure_number": start["measure_number"],
            "beat_offset": start["beat_offset"],
            "voice": start["voice"],
            "technique": technique,
            "action": "remove",
        },
    )
    assert removed.status_code == 200, removed.text
    assert removed.json()["action"] == "removed"
    assert tag not in removed.json()["musicxml"]


@pytest.mark.parametrize(
    "marker",
    [
        "natural_harmonic",
        "artificial_harmonic",
        "vibrato",
        "dead_note",
        "ghost_note",
        "strum_up",
        "strum_down",
    ],
)
def test_technical_marker_round_trips(client: TestClient, marker: str) -> None:
    xml = _load("guitar_hopo_bend.musicxml")
    notes = _guitar_notes(client, xml)
    target = _resolve(client, xml, notes[0])
    body = {
        "musicxml": xml,
        "part_index": target["part_index"],
        "measure_number": target["measure_number"],
        "beat_offset": target["beat_offset"],
        "voice": target["voice"],
        "marker": marker,
    }
    added = client.post("/score/edit/technical/toggle", json=body)
    assert added.status_code == 200, added.text
    assert added.json()["action"] == "added"
    marked_xml = added.json()["musicxml"]
    assert len(_guitar_notes(client, marked_xml)) == 4

    removed = client.post("/score/edit/technical/toggle", json={**body, "musicxml": marked_xml})
    assert removed.status_code == 200, removed.text
    assert removed.json()["action"] == "removed"


def test_slide_round_trips(client: TestClient) -> None:
    xml = _load("guitar_hopo_bend.musicxml")
    notes = _guitar_notes(client, xml)
    start = _resolve(client, xml, notes[0])
    added = client.post(
        "/score/edit/technical/connect",
        json={
            "musicxml": xml,
            "part_index": start["part_index"],
            "measure_number": start["measure_number"],
            "beat_offset": start["beat_offset"],
            "voice": start["voice"],
            "technique": "slide",
            "action": "set",
        },
    )
    assert added.status_code == 200, added.text
    assert added.json()["action"] == "added"
    assert "glissando" in added.json()["musicxml"]
    assert len(_guitar_notes(client, added.json()["musicxml"])) == 4


@pytest.mark.parametrize("technique", ["palm_mute", "let_ring"])
def test_bracket_span_round_trips(client: TestClient, technique: str) -> None:
    xml = _load("guitar_hopo_bend.musicxml")
    notes = _guitar_notes(client, xml)
    start = _resolve(client, xml, notes[0])
    body = {
        "musicxml": xml,
        "part_index": start["part_index"],
        "measure_number": start["measure_number"],
        "beat_offset": start["beat_offset"],
        "voice": start["voice"],
        "technique": technique,
    }
    added = client.post("/score/edit/technical/span", json={**body, "action": "set"})
    assert added.status_code == 200, added.text
    assert added.json()["action"] == "added"
    spanned_xml = added.json()["musicxml"]
    assert "<bracket" in spanned_xml
    assert len(_guitar_notes(client, spanned_xml)) == 4

    removed = client.post(
        "/score/edit/technical/span",
        json={**body, "musicxml": spanned_xml, "action": "remove"},
    )
    assert removed.status_code == 200, removed.text
    assert removed.json()["action"] == "removed"
    assert "<bracket" not in removed.json()["musicxml"]


def test_connective_technique_needs_following_note(client: TestClient) -> None:
    xml = _load("guitar_hopo_bend.musicxml")
    notes = _guitar_notes(client, xml)
    last = _resolve(client, xml, notes[-1])  # last note in the measure
    resp = client.post(
        "/score/edit/technical/connect",
        json={
            "musicxml": xml,
            "part_index": last["part_index"],
            "measure_number": last["measure_number"],
            "beat_offset": last["beat_offset"],
            "voice": last["voice"],
            "technique": "hammer_on",
            "action": "set",
        },
    )
    assert resp.status_code == 400
    assert "following note" in resp.json()["detail"]
