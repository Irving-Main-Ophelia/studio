"""Tests for the tablature view projection (Phase 4 / Track A — A1).

Covers the fret math (``fretboard.py``), the MusicXML projection (``tab_projection.py``)
over the M3.5.3 edit corpus, and the ``/score/tab/project`` route. The projection must
produce MusicXML that (a) OSMD can render as tab (TAB clef + ``<staff-details>`` lines +
per-note ``<string>/<fret>``) and (b) still parses cleanly with music21.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from music21 import converter

from app.main import create_app
from app.tools.fretboard import (
    STANDARD_TUNING,
    assign_fret,
    pitch_name_to_midi,
)
from app.tools.tab_projection import (
    PartView,
    _measure_duration,
    project_view,
    project_views,
)

# A minimal two-part score (guitar + a second part) for per-part view tests.
TWO_PART_XML = """<?xml version='1.0' encoding='utf-8'?>
<score-partwise version='4.0'>
  <part-list>
    <score-part id='P1'><part-name>Guitar</part-name></score-part>
    <score-part id='P2'><part-name>Bass</part-name></score-part>
  </part-list>
  <part id='P1'>
    <measure number='1'>
      <attributes><divisions>4</divisions><key><fifths>0</fifths></key>
      <time><beats>4</beats><beat-type>4</beat-type></time>
      <clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
  <part id='P2'>
    <measure number='1'>
      <attributes><divisions>4</divisions><key><fifths>0</fifths></key>
      <time><beats>4</beats><beat-type>4</beat-type></time>
      <clef><sign>F</sign><line>4</line></clef></attributes>
      <note><pitch><step>E</step><octave>2</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>"""

FIXTURES = Path(__file__).parent / "fixtures"
FIXTURE_FILES = sorted(FIXTURES.glob("*.musicxml"))


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app())


def _load(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


# --------------------------------------------------------------------------- #
# fret math
# --------------------------------------------------------------------------- #


def test_pitch_name_to_midi_handles_accidentals() -> None:
    assert pitch_name_to_midi("C4") == 60
    assert pitch_name_to_midi("E4") == 64
    assert pitch_name_to_midi("E2") == 40
    assert pitch_name_to_midi("C#3") == 49
    assert pitch_name_to_midi("Db3") == 49


def test_assign_fret_open_strings_standard_tuning() -> None:
    # Each open string ⇒ fret 0 on its own string (string 1 = high E … string 6 = low E).
    for i, name in enumerate(STANDARD_TUNING):
        pos = assign_fret(pitch_name_to_midi(name), STANDARD_TUNING)
        assert pos is not None
        assert pos.fret == 0
        assert pos.string == i + 1


def test_assign_fret_prefers_lowest_fret() -> None:
    # A4 (MIDI 69) is open string 1 + 5 frets ⇒ string 1, fret 5 (lowest available).
    pos = assign_fret(pitch_name_to_midi("A4"), STANDARD_TUNING)
    assert pos is not None and pos.string == 1 and pos.fret == 5


def test_assign_fret_capo_shifts_open_pitch() -> None:
    # With a capo on fret 2, the high E string now sounds F#4; fret numbers read
    # relative to the capo, so F#4 is "open" (fret 0) above the capo.
    pos = assign_fret(pitch_name_to_midi("F#4"), STANDARD_TUNING, capo=2)
    assert pos is not None and pos.string == 1 and pos.fret == 0


def test_assign_fret_unplayable_returns_none() -> None:
    # Below the lowest open string ⇒ no position.
    assert assign_fret(pitch_name_to_midi("C1"), STANDARD_TUNING) is None


# --------------------------------------------------------------------------- #
# projection — staff / tab / both
# --------------------------------------------------------------------------- #


def test_staff_view_is_identity() -> None:
    xml = _load("guitar_technical.musicxml")
    assert project_view(xml, view_mode="staff") == xml


def test_tab_view_emits_tab_clef_and_positions() -> None:
    out = project_view(_load("guitar_technical.musicxml"), view_mode="tab")
    root = ET.fromstring(out)
    clef = root.find("part/measure/attributes/clef")
    assert clef is not None and clef.findtext("sign") == "TAB"
    details = root.find("part/measure/attributes/staff-details")
    assert details is not None and details.findtext("staff-lines") == "6"
    assert len(details.findall("staff-tuning")) == 6
    for note in root.findall("part/measure/note"):
        if note.find("pitch") is None:
            continue
        tech = note.find("notations/technical")
        assert tech is not None, "every pitched note gets a tab position"
        assert tech.find("string") is not None and tech.find("fret") is not None


def test_tab_view_preserves_authored_positions() -> None:
    # The fixture authors string 1 / frets 0,3,5,12 by hand — they must win over
    # any computed assignment.
    out = project_view(_load("guitar_technical.musicxml"), view_mode="tab")
    root = ET.fromstring(out)
    frets = [n.find("notations/technical").findtext("fret") for n in root.findall("part/measure/note")]
    assert frets == ["0", "3", "5", "12"]


def test_both_view_makes_two_staves_with_balanced_timing() -> None:
    out = project_view(_load("guitar_technical.musicxml"), view_mode="both")
    root = ET.fromstring(out)
    attrs = root.find("part/measure/attributes")
    assert attrs.findtext("staves") == "2"
    signs = {(c.get("number"), c.findtext("sign")) for c in attrs.findall("clef")}
    assert ("1", "G") in signs and ("2", "TAB") in signs
    measure = root.find("part/measure")
    assert measure.find("backup") is not None
    staff1 = [n for n in measure.findall("note") if n.findtext("staff") == "1"]
    staff2 = [n for n in measure.findall("note") if n.findtext("staff") == "2"]
    assert len(staff1) == len(staff2) == 4
    # The whole measure's net cursor advance still equals one measure (16 divisions).
    assert _measure_duration(measure) == 16


def test_both_view_offsets_tab_voice_numbers() -> None:
    out = project_view(_load("guitar_technical.musicxml"), view_mode="both")
    root = ET.fromstring(out)
    staff2 = [n for n in root.findall("part/measure/note") if n.findtext("staff") == "2"]
    assert all(n.findtext("voice") == "11" for n in staff2)


@pytest.mark.parametrize("view_mode", ["tab", "both"])
@pytest.mark.parametrize(
    "fixture", [f.name for f in FIXTURE_FILES], ids=[f.stem for f in FIXTURE_FILES]
)
def test_projection_round_trips_through_music21(fixture: str, view_mode: str) -> None:
    # The projected MusicXML must stay parseable by music21 across the whole corpus
    # (multi-voice <backup>, grand staff, cross-staff, tuplets, guitar <technical>).
    out = project_view(_load(fixture), view_mode=view_mode)
    score = converter.parseData(out, format="musicxml")
    assert len(list(score.recurse().notes)) > 0


@pytest.mark.parametrize(
    "fixture", [f.name for f in FIXTURE_FILES], ids=[f.stem for f in FIXTURE_FILES]
)
def test_both_view_keeps_measures_balanced_over_corpus(fixture: str) -> None:
    out = project_view(_load(fixture), view_mode="both")
    root = ET.fromstring(out)
    for measure in root.findall("part/measure"):
        # Each measure's net advance must be non-negative and consistent (no runaway
        # backup math) — the multi-voice class of bug the corpus exists to catch.
        assert _measure_duration(measure) >= 0


def test_projection_rejects_bad_inputs() -> None:
    xml = _load("guitar_technical.musicxml")
    with pytest.raises(ValueError):
        project_view(xml, view_mode="lute")
    with pytest.raises(ValueError):
        project_view(xml, view_mode="tab", part_index=99)


# --------------------------------------------------------------------------- #
# per-part projection (A1 — multi-part scores)
# --------------------------------------------------------------------------- #


def test_project_views_only_touches_requested_parts() -> None:
    out = project_views(
        TWO_PART_XML,
        [
            PartView(part_index=0, view_mode="tab"),
            PartView(part_index=1, view_mode="staff"),
        ],
    )
    root = ET.fromstring(out)
    parts = root.findall("part")
    # Part 0 became a tab staff; part 1 kept its bass clef untouched.
    assert parts[0].find("measure/attributes/clef/sign").text == "TAB"
    assert parts[1].find("measure/attributes/clef/sign").text == "F"
    assert parts[0].find("measure/note/notations/technical/fret") is not None
    assert parts[1].find("measure/note/notations") is None


def test_project_views_all_staff_is_identity() -> None:
    out = project_views(
        TWO_PART_XML,
        [PartView(0, "staff"), PartView(1, "staff")],
    )
    assert out == TWO_PART_XML


def test_project_views_can_tab_both_parts() -> None:
    out = project_views(TWO_PART_XML, [PartView(0, "tab"), PartView(1, "tab")])
    root = ET.fromstring(out)
    signs = [p.find("measure/attributes/clef/sign").text for p in root.findall("part")]
    assert signs == ["TAB", "TAB"]


# --------------------------------------------------------------------------- #
# route
# --------------------------------------------------------------------------- #


def test_route_projects_tab(client: TestClient) -> None:
    xml = _load("guitar_technical.musicxml")
    res = client.post("/score/tab/project", json={"musicxml": xml, "view_mode": "tab"})
    assert res.status_code == 200, res.text
    out = res.json()["musicxml"]
    assert "<sign>TAB</sign>" in out


def test_route_validates_view_mode(client: TestClient) -> None:
    xml = _load("guitar_technical.musicxml")
    res = client.post("/score/tab/project", json={"musicxml": xml, "view_mode": "lute"})
    assert res.status_code == 422


def test_route_reports_bad_part_index(client: TestClient) -> None:
    xml = _load("guitar_technical.musicxml")
    res = client.post(
        "/score/tab/project",
        json={"musicxml": xml, "view_mode": "tab", "part_index": 99},
    )
    assert res.status_code == 400


def test_route_accepts_per_part_list(client: TestClient) -> None:
    res = client.post(
        "/score/tab/project",
        json={
            "musicxml": TWO_PART_XML,
            "parts": [
                {"part_index": 0, "view_mode": "tab"},
                {"part_index": 1, "view_mode": "staff"},
            ],
        },
    )
    assert res.status_code == 200, res.text
    out = res.json()["musicxml"]
    assert out.count("<sign>TAB</sign>") == 1  # only part 0


def test_route_requires_parts_or_view_mode(client: TestClient) -> None:
    res = client.post("/score/tab/project", json={"musicxml": TWO_PART_XML})
    assert res.status_code == 422
