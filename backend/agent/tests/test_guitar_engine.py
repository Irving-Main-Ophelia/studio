"""Tests for the algorithmic chord/scale fretboard engine (A5 + A6).

Voicings are generated, not looked up — so the tests assert *musical* invariants
(the right pitch classes, root in bass, playable spans) rather than exact shapes,
plus the well-known open-chord and pentatonic-box positions as a sanity anchor.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.tools.guitar_engine import (
    chord_pitch_classes,
    chord_voicings,
    pitch_class_of,
    scale_pitch_classes,
    scale_shape,
)


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app())


def test_pitch_class_of_handles_accidentals() -> None:
    assert pitch_class_of("C") == 0
    assert pitch_class_of("B#") == 0
    assert pitch_class_of("Bb") == 10
    assert pitch_class_of("F#") == 6
    assert pitch_class_of("Gb") == 6


def test_chord_pitch_classes_normalizes_root_flat() -> None:
    pcs, root, _ = chord_pitch_classes("Bb")  # would mis-parse without b→- normalisation
    assert root == 10
    assert pcs == {10, 2, 5}  # Bb D F


@pytest.mark.parametrize(
    ("figure", "expected_pcs"),
    [
        ("C", {0, 4, 7}),
        ("Am", {9, 0, 4}),
        ("G7", {7, 11, 2, 5}),
        ("Dm7", {2, 5, 9, 0}),
    ],
)
def test_voicings_cover_chord_tones(figure: str, expected_pcs: set[int]) -> None:
    result = chord_voicings(figure, max_voicings=5)
    assert result["voicings"], f"{figure}: no voicings generated"
    for v in result["voicings"]:
        pcs = {p["midi"] % 12 for p in v["positions"]}
        assert pcs == expected_pcs, f"{figure}: voicing {v} doesn't cover the chord"
        # Playability: fretted notes fit a hand (≤ 4-fret span).
        fretted = [p["fret"] for p in v["positions"] if p["fret"] > 0]
        if fretted:
            assert max(fretted) - min(fretted) <= 4


def test_best_C_voicing_is_root_in_bass() -> None:
    best = chord_voicings("C", max_voicings=1)["voicings"][0]
    assert best["root_in_bass"]
    assert best["lowest_pitch"].startswith("C")


def test_scale_pitch_classes_major_and_minor() -> None:
    pcs, tonic = scale_pitch_classes("C", "major")
    assert tonic == 0
    assert pcs == [0, 2, 4, 5, 7, 9, 11]
    pcs_a, tonic_a = scale_pitch_classes("A", "minor_pentatonic")
    assert tonic_a == 9
    assert set(pcs_a) == {9, 0, 2, 4, 7}


def test_scale_shape_marks_roots_in_window() -> None:
    shape = scale_shape("A", "minor_pentatonic", min_fret=5, span=4)
    assert shape["positions"], "no positions in the box"
    assert all(shape["min_fret"] <= p["fret"] <= shape["max_fret"] for p in shape["positions"])
    roots = {(p["string"], p["fret"]) for p in shape["positions"] if p["is_root"]}
    # Position-1 A-minor-pentatonic box: A roots on strings 1 & 6 at fret 5.
    assert (1, 5) in roots
    assert (6, 5) in roots


def test_route_chord_voicings(client: TestClient) -> None:
    resp = client.post("/guitar/chord/voicings", json={"chord": "Am", "max_voicings": 3})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["chord"] == "Am"
    assert 1 <= body["count"] <= 3


def test_route_scale_shape(client: TestClient) -> None:
    resp = client.post(
        "/guitar/scale/shape", json={"tonic": "E", "scale": "dorian", "min_fret": 0, "span": 4}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["positions"]


def test_route_rejects_unknown_scale(client: TestClient) -> None:
    resp = client.post("/guitar/scale/shape", json={"tonic": "C", "scale": "bogus"})
    assert resp.status_code == 400


def test_dispatch_guitar_chord_and_scale() -> None:
    from app.agent_tools import dispatch_tool

    payload, diff = dispatch_tool("guitar_chord_voicings", {"chord": "G7"}, "<score/>")
    assert diff is None
    assert payload["voicings"]
    payload2, diff2 = dispatch_tool(
        "guitar_scale_shape", {"tonic": "A", "scale": "blues"}, "<score/>"
    )
    assert diff2 is None
    assert payload2["positions"]
