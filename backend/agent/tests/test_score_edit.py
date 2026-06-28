"""Integration tests for the M1.1 symbolic score-edit endpoints."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

BLANK_PIANO_SCORE = """<?xml version='1.0' encoding='utf-8'?>
<!DOCTYPE score-partwise PUBLIC '-//Recordare//DTD MusicXML 4.0 Partwise//EN' 'http://www.musicxml.org/dtds/partwise.dtd'>
<score-partwise version='4.0'>
  <part-list>
    <score-part id='P1'>
      <part-name>Piano</part-name>
    </score-part>
  </part-list>
  <part id='P1'>
    <measure number='1'>
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <rest measure='yes'/>
        <duration>16</duration>
        <voice>1</voice>
        <type>whole</type>
      </note>
    </measure>
    <measure number='2'>
      <note>
        <rest measure='yes'/>
        <duration>16</duration>
        <voice>1</voice>
        <type>whole</type>
      </note>
    </measure>
  </part>
</score-partwise>
"""


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app())


def _insert_quarter(
    client: TestClient,
    *,
    musicxml: str,
    pitch: str,
    measure: int,
    beat: float,
) -> dict[str, str | float | int]:
    res = client.post(
        "/score/edit/note/insert",
        json={
            "musicxml": musicxml,
            "part_index": 0,
            "measure_number": measure,
            "beat_offset": beat,
            "pitch": pitch,
            "duration_quarters": 1.0,
        },
    )
    assert res.status_code == 200, res.text
    return res.json()  # type: ignore[no-any-return]


def test_insert_note_returns_next_cursor(client: TestClient) -> None:
    body = _insert_quarter(client, musicxml=BLANK_PIANO_SCORE, pitch="C4", measure=1, beat=0.0)
    assert body["next_cursor"]["beat_offset"] == 1.0
    assert body["inserted_note"]["midi"] == 60
    assert "C4" in body["inserted_note"]["pitch"]
    assert "<step>C</step>" in str(body["musicxml"])
    assert "<octave>4</octave>" in str(body["musicxml"])


def test_insert_then_remove_brings_back_rest(client: TestClient) -> None:
    inserted = _insert_quarter(client, musicxml=BLANK_PIANO_SCORE, pitch="C4", measure=1, beat=0.0)
    res = client.post(
        "/score/edit/note/remove",
        json={
            "musicxml": inserted["musicxml"],
            "part_index": 0,
            "measure_number": 1,
            "beat_offset": 0.0,
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert "<rest" in body["musicxml"]


def test_articulation_toggle_is_idempotent_pair(client: TestClient) -> None:
    inserted = _insert_quarter(client, musicxml=BLANK_PIANO_SCORE, pitch="G4", measure=1, beat=0.0)
    add = client.post(
        "/score/edit/articulation/toggle",
        json={
            "musicxml": inserted["musicxml"],
            "part_index": 0,
            "measure_number": 1,
            "beat_offset": 0.0,
            "articulation": "staccato",
        },
    )
    assert add.status_code == 200
    assert add.json()["action"] == "added"
    assert "<staccato" in add.json()["musicxml"]

    remove = client.post(
        "/score/edit/articulation/toggle",
        json={
            "musicxml": add.json()["musicxml"],
            "part_index": 0,
            "measure_number": 1,
            "beat_offset": 0.0,
            "articulation": "staccato",
        },
    )
    assert remove.status_code == 200
    assert remove.json()["action"] == "removed"
    assert "<staccato" not in remove.json()["musicxml"]


def test_invalid_articulation_rejected(client: TestClient) -> None:
    res = client.post(
        "/score/edit/articulation/toggle",
        json={
            "musicxml": BLANK_PIANO_SCORE,
            "part_index": 0,
            "measure_number": 1,
            "beat_offset": 0.0,
            "articulation": "trill-flutter",
        },
    )
    assert res.status_code == 422


def test_tie_then_release(client: TestClient) -> None:
    inserted = _insert_quarter(client, musicxml=BLANK_PIANO_SCORE, pitch="A4", measure=1, beat=0.0)
    tie = client.post(
        "/score/edit/tie/set",
        json={
            "musicxml": inserted["musicxml"],
            "part_index": 0,
            "measure_number": 1,
            "beat_offset": 0.0,
            "tie_type": "start",
        },
    )
    assert tie.status_code == 200
    assert "<tie" in tie.json()["musicxml"]

    untie = client.post(
        "/score/edit/tie/set",
        json={
            "musicxml": tie.json()["musicxml"],
            "part_index": 0,
            "measure_number": 1,
            "beat_offset": 0.0,
            "tie_type": "none",
        },
    )
    assert untie.status_code == 200
    assert "<tie" not in untie.json()["musicxml"]


def test_dynamic_marker_attached(client: TestClient) -> None:
    res = client.post(
        "/score/edit/dynamic/set",
        json={
            "musicxml": BLANK_PIANO_SCORE,
            "part_index": 0,
            "measure_number": 1,
            "beat_offset": 0.0,
            "dynamic": "mf",
        },
    )
    assert res.status_code == 200
    assert "<mf" in res.json()["musicxml"] or "<dynamics" in res.json()["musicxml"]


def test_append_measure_bumps_count(client: TestClient) -> None:
    res = client.post(
        "/score/edit/measure/append",
        json={"musicxml": BLANK_PIANO_SCORE, "part_index": 0},
    )
    assert res.status_code == 200
    assert res.json()["new_measure_number"] == 3


def test_missing_note_returns_400(client: TestClient) -> None:
    res = client.post(
        "/score/edit/note/remove",
        json={
            "musicxml": BLANK_PIANO_SCORE,
            "part_index": 0,
            "measure_number": 1,
            "beat_offset": 0.0,
        },
    )
    assert res.status_code == 400


def test_full_short_phrase_round_trip(client: TestClient) -> None:
    """Mirrors the human flow: insert a 5-note phrase, then re-extract notes."""
    pitches = ["C4", "D4", "E4", "F4", "G4"]
    musicxml = BLANK_PIANO_SCORE
    beat = 0.0
    for pitch in pitches:
        body = _insert_quarter(
            client,
            musicxml=musicxml,
            pitch=pitch,
            measure=1,
            beat=beat,
        )
        musicxml = str(body["musicxml"])
        beat = float(body["next_cursor"]["beat_offset"])
    notes_res = client.post("/score/notes", json={"musicxml": musicxml})
    assert notes_res.status_code == 200
    extracted = [n["midi"] for n in notes_res.json()["notes"]]
    assert extracted == [60, 62, 64, 65, 67]


def test_note_info_after_insert(client: TestClient) -> None:
    inserted = _insert_quarter(client, musicxml=BLANK_PIANO_SCORE, pitch="E4", measure=1, beat=0.0)
    res = client.post(
        "/score/edit/note/info",
        json={
            "musicxml": inserted["musicxml"],
            "part_index": 0,
            "measure_number": 1,
            "beat_offset": 0.0,
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["pitch"] == "E4"
    assert body["duration_quarters"] == 1.0
    assert body["is_rest"] is False


def test_change_duration(client: TestClient) -> None:
    inserted = _insert_quarter(client, musicxml=BLANK_PIANO_SCORE, pitch="C4", measure=1, beat=0.0)
    res = client.post(
        "/score/edit/note/duration",
        json={
            "musicxml": inserted["musicxml"],
            "part_index": 0,
            "measure_number": 1,
            "beat_offset": 0.0,
            "duration_quarters": 2.0,
        },
    )
    assert res.status_code == 200
    assert "<type>half</type>" in res.json()["musicxml"]


def test_respell_note(client: TestClient) -> None:
    inserted = _insert_quarter(client, musicxml=BLANK_PIANO_SCORE, pitch="F#4", measure=1, beat=0.0)
    res = client.post(
        "/score/edit/note/respell",
        json={
            "musicxml": inserted["musicxml"],
            "part_index": 0,
            "measure_number": 1,
            "beat_offset": 0.0,
        },
    )
    assert res.status_code == 200
    assert res.json()["pitch"] == "G-4"


def test_set_key_signature(client: TestClient) -> None:
    res = client.post(
        "/score/edit/key-signature/set",
        json={"musicxml": BLANK_PIANO_SCORE, "tonic": "A", "mode": "major"},
    )
    assert res.status_code == 200
    assert res.json()["key"] == "A major"
    assert "<fifths>3</fifths>" in res.json()["musicxml"]


def test_transpose_semitones(client: TestClient) -> None:
    inserted = _insert_quarter(client, musicxml=BLANK_PIANO_SCORE, pitch="G4", measure=1, beat=0.0)
    res = client.post(
        "/score/edit/note/transpose-semitones",
        json={
            "musicxml": inserted["musicxml"],
            "part_index": 0,
            "measure_number": 1,
            "beat_offset": 0.0,
            "semitones": 1,
        },
    )
    assert res.status_code == 200, res.text
    assert res.json()["pitch"] == "G#4"


def test_change_pitch(client: TestClient) -> None:
    inserted = _insert_quarter(client, musicxml=BLANK_PIANO_SCORE, pitch="A4", measure=1, beat=0.0)
    res = client.post(
        "/score/edit/note/pitch",
        json={
            "musicxml": inserted["musicxml"],
            "part_index": 0,
            "measure_number": 1,
            "beat_offset": 0.0,
            "pitch": "F4",
        },
    )
    assert res.status_code == 200, res.text
    assert res.json()["pitch"] == "F4"


TWO_VOICE_SCORE = """<?xml version='1.0' encoding='utf-8'?>
<!DOCTYPE score-partwise PUBLIC '-//Recordare//DTD MusicXML 4.0 Partwise//EN' 'http://www.musicxml.org/dtds/partwise.dtd'>
<score-partwise version='4.0'>
  <part-list>
    <score-part id='P1'><part-name>Piano</part-name></score-part>
  </part-list>
  <part id='P1'>
    <measure number='1'>
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>16</duration><voice>1</voice><type>whole</type>
      </note>
      <backup><duration>16</duration></backup>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>16</duration><voice>2</voice><type>whole</type>
      </note>
    </measure>
  </part>
</score-partwise>
"""


def test_list_notes_multi_voice_returns_both_voices(client: TestClient) -> None:
    res = client.post("/score/edit/notes/list", json={"musicxml": TWO_VOICE_SCORE})
    assert res.status_code == 200, res.text
    notes = res.json()["notes"]
    pitches = {n["pitch"] for n in notes}
    assert "C4" in pitches, f"C4 missing from multi-voice list: {notes}"
    assert "E4" in pitches, f"E4 missing from multi-voice list: {notes}"
    voice_ids = {n["voice"] for n in notes}
    assert voice_ids != {None}, "voice should not be None for all notes in a multi-voice score"


def test_transpose_semitones_multi_voice(client: TestClient) -> None:
    resolve = client.post(
        "/score/edit/note/resolve",
        json={"musicxml": TWO_VOICE_SCORE, "measure_number": 1, "pitch": "C4", "beat_hint": 0.0},
    )
    assert resolve.status_code == 200, resolve.text
    r = resolve.json()
    assert r["pitch"] == "C4"
    assert r["voice"] is not None, "voice must be resolved for multi-voice score"

    res = client.post(
        "/score/edit/note/transpose-semitones",
        json={
            "musicxml": TWO_VOICE_SCORE,
            "part_index": r["part_index"],
            "measure_number": r["measure_number"],
            "beat_offset": r["beat_offset"],
            "voice": r["voice"],
            "semitones": 1,
        },
    )
    assert res.status_code == 200, res.text
    assert res.json()["pitch"] == "C#4"
    assert "<step>C</step>" in res.json()["musicxml"]
    assert "<alter>1</alter>" in res.json()["musicxml"]


def test_resolve_note_by_hint_wrong_part(client: TestClient) -> None:
    inserted = _insert_quarter(client, musicxml=BLANK_PIANO_SCORE, pitch="D4", measure=1, beat=0.0)
    res = client.post(
        "/score/edit/note/resolve",
        json={
            "musicxml": inserted["musicxml"],
            "measure_number": 1,
            "pitch": "D4",
            "beat_hint": 0.25,
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["pitch"] == "D4"
    assert body["beat_offset"] == 0.0
    assert body["part_index"] == 0
