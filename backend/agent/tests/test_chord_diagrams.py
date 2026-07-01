"""Tests for auto chord-diagram derivation (Phase 4 / Track A — A5 §4.7 Q2).

Covers the density control (``all`` / ``changes`` / ``unique``), the per-string
diagram shape produced from the chord engine's best voicing, and the
``/score/tab/chord-diagrams`` route.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.tools.chord_diagrams import MUTED, chord_diagrams

# Three measures spelling C, C, G triads so the three densities diverge:
#   all     → 3 diagrams (C, C, G)
#   changes → 2 diagrams (C at m1, G at m3)
#   unique  → 2 diagrams (C, G — first occurrence of each)
CCG_XML = """<?xml version='1.0' encoding='utf-8'?>
<score-partwise version='4.0'>
  <part-list><score-part id='P1'><part-name>Gtr</part-name></score-part></part-list>
  <part id='P1'>
    <measure number='1'>
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
      <note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
    <measure number='2'>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
      <note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
    <measure number='3'>
      <note><pitch><step>G</step><octave>3</octave></pitch><duration>4</duration><type>whole</type></note>
      <note><chord/><pitch><step>B</step><octave>3</octave></pitch><duration>4</duration><type>whole</type></note>
      <note><chord/><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
  </part>
</score-partwise>"""


def test_density_all_gives_one_per_measure() -> None:
    result = chord_diagrams(CCG_XML, density="all")
    assert [d["chord"] for d in result["diagrams"]] == ["C", "C", "G"]
    assert result["count"] == 3
    assert result["density"] == "all"


def test_density_changes_collapses_repeats() -> None:
    result = chord_diagrams(CCG_XML, density="changes")
    # C (m1) then G (m3); the repeated C in m2 is dropped.
    assert [(d["measure"], d["chord"]) for d in result["diagrams"]] == [(1, "C"), (3, "G")]


def test_density_unique_dedupes_across_the_piece() -> None:
    result = chord_diagrams(CCG_XML, density="unique")
    assert [d["chord"] for d in result["diagrams"]] == ["C", "G"]


def test_diagram_shape_matches_tuning_and_marks_muted() -> None:
    result = chord_diagrams(CCG_XML, density="unique", tuning=["E4", "B3", "G3", "D3", "A2", "E2"])
    c_major = result["diagrams"][0]
    assert c_major["chord"] == "C"
    assert len(c_major["frets"]) == 6  # one entry per string
    # Every entry is a real fret (>=0), an open string (0), or muted (-1).
    assert all(f == MUTED or f >= 0 for f in c_major["frets"])
    # A C major chord is not playable across all six open/low strings — at least one
    # string is either fretted or muted (the diagram is not all-open).
    assert any(f != 0 for f in c_major["frets"])


def test_rejects_unknown_density() -> None:
    with pytest.raises(ValueError):
        chord_diagrams(CCG_XML, density="every-beat")


def test_route_round_trips() -> None:
    client = TestClient(create_app())
    resp = client.post(
        "/score/tab/chord-diagrams", json={"musicxml": CCG_XML, "density": "changes"}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["count"] == 2
    assert body["density"] == "changes"
    assert [d["chord"] for d in body["diagrams"]] == ["C", "G"]


def test_route_rejects_bad_density() -> None:
    client = TestClient(create_app())
    resp = client.post("/score/tab/chord-diagrams", json={"musicxml": CCG_XML, "density": "nope"})
    assert resp.status_code == 422  # pydantic validation
