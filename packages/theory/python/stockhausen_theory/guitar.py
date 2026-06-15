"""Classical guitar extended-technique MusicXML injector.

Provides functions to add MusicXML 4.0 <technical> and <articulations>
markings for classical guitar extended techniques:

  - Armónicos artificiales  (artificial harmonics)
  - Armónicos naturales     (natural harmonics)
  - Golpes                  (percussive soundboard strikes)
  - Left-hand fingering     (1–4 + 0 for open string)
  - Right-hand fingering    (p, i, m, a)
  - Barre / cejilla         (full and half barre)
  - Ligados                 (slur/legato marking)
  - Sul ponticello / sul tasto / con sordino (tonal colour directions)
  - Snap pizzicato          (Bartók pizzicato)
  - Tremolo                 (repeated-note tremolo)

All functions accept a MusicXML string and return a modified MusicXML
string. Modifications are applied via xml.etree.ElementTree so they
round-trip cleanly through Verovio and music21.

Guitar notation conventions used here:
  - Guitar sounds one octave below written pitch (transposing instrument).
    The <part> should be labelled "Guitar" or "Classical Guitar" and its
    <transpose> element set to <diatonic>-7</diatonic><chromatic>-12</chromatic>.
  - Right-hand finger labels follow standard PIMA notation (p=thumb,
    i=index, m=middle, a=ring).  MusicXML uses the <pluck> element.
  - Left-hand finger numbers (0=open, 1–4) use <fingering>.
  - String numbers (1=high E through 6=low E) use <string>.
  - Fret numbers use <fret>.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from typing import Any


# ---------------------------------------------------------------------------
# XML namespace helpers
# ---------------------------------------------------------------------------

_NS = "http://www.musicxml.org/schema/mxl"

# MusicXML files may or may not have a default namespace declaration.
# We work with the raw element tag names (stripping any namespace prefix)
# so we are robust to both namespaced and non-namespaced files.

def _strip_ns(tag: str) -> str:
    return tag.split("}")[-1] if "}" in tag else tag


def _find_all(element: ET.Element, tag: str) -> list[ET.Element]:
    """Find all descendants by local name, ignoring namespace."""
    return [el for el in element.iter() if _strip_ns(el.tag) == tag]


def _find_first(element: ET.Element, tag: str) -> ET.Element | None:
    results = _find_all(element, tag)
    return results[0] if results else None


def _make_tag(template_el: ET.Element, local: str) -> str:
    """Create a tag string matching the namespace of template_el."""
    t = template_el.tag
    if "}" in t:
        ns = t.split("}")[0] + "}"
        return f"{ns}{local}"
    return local


# ---------------------------------------------------------------------------
# Note lookup helpers
# ---------------------------------------------------------------------------

def _notes_in_measure(
    root: ET.Element,
    measure_number: int,
) -> list[ET.Element]:
    """Return all <note> elements in the given measure number."""
    notes: list[ET.Element] = []
    for measure in _find_all(root, "measure"):
        num = measure.get("number", "")
        try:
            if int(num) == measure_number:
                notes.extend(_find_all(measure, "note"))
        except ValueError:
            pass
    return notes


def _note_at(root: ET.Element, measure: int, beat: float) -> ET.Element | None:
    """Find the first note that starts at approximately `beat` in `measure`.

    Beat is 1-based (beat 1 = first beat). We match within ±0.05 beat.
    Division per quarter is read from the <divisions> element.
    """
    for measure_el in _find_all(root, "measure"):
        num = measure_el.get("number", "")
        try:
            if int(num) != measure:
                continue
        except ValueError:
            continue

        # Read <divisions> (ticks per quarter note) from this measure or earlier
        divisions_el = _find_first(measure_el, "divisions")
        divisions = int(divisions_el.text or "1") if divisions_el is not None else 1

        current_offset = 0
        for child in measure_el:
            local = _strip_ns(child.tag)
            if local == "backup":
                dur_el = _find_first(child, "duration")
                if dur_el is not None:
                    current_offset -= int(dur_el.text or "0")
            elif local == "forward":
                dur_el = _find_first(child, "duration")
                if dur_el is not None:
                    current_offset += int(dur_el.text or "0")
            elif local == "note":
                rest_el = _find_first(child, "rest")
                chord_el = _find_first(child, "chord")
                current_beat = (current_offset / divisions) + 1.0
                if abs(current_beat - beat) < 0.06:
                    return child
                if chord_el is None and rest_el is None:
                    dur_el = _find_first(child, "duration")
                    if dur_el is not None:
                        current_offset += int(dur_el.text or "0")
    return None


def _get_or_create_technical(note_el: ET.Element) -> ET.Element:
    """Return the <technical> child of a <note>, creating it if absent."""
    notations = _find_first(note_el, "notations")
    if notations is None:
        notations = ET.SubElement(note_el, _make_tag(note_el, "notations"))
    technical = _find_first(note_el, "technical")
    if technical is None:
        technical = ET.SubElement(notations, _make_tag(notations, "technical"))
    return technical


def _get_or_create_articulations(note_el: ET.Element) -> ET.Element:
    notations = _find_first(note_el, "notations")
    if notations is None:
        notations = ET.SubElement(note_el, _make_tag(note_el, "notations"))
    articulations = _find_first(note_el, "articulations")
    if articulations is None:
        articulations = ET.SubElement(notations, _make_tag(notations, "articulations"))
    return articulations


# ---------------------------------------------------------------------------
# Round-trip serialisation
# ---------------------------------------------------------------------------

def _parse_xml(musicxml: str) -> ET.Element:
    # Strip XML declaration so ElementTree can handle it without encoding issues
    cleaned = re.sub(r"<\?xml[^?]*\?>", "", musicxml, count=1).strip()
    return ET.fromstring(cleaned)


def _serialise(root: ET.Element, original: str) -> str:
    """Serialise back to string, preserving the original XML declaration."""
    decl_match = re.match(r"(<\?xml[^?]*\?>)", original.lstrip())
    decl = decl_match.group(1) if decl_match else '<?xml version="1.0" encoding="UTF-8"?>'
    body = ET.tostring(root, encoding="unicode", xml_declaration=False)
    return f"{decl}\n{body}"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def add_harmonic(
    musicxml: str,
    *,
    measure: int,
    beat: float,
    harmonic_type: str = "artificial",
    base_string: int | None = None,
    node_fret: int | None = None,
) -> str:
    """Add a harmonic marking to the note at (measure, beat).

    harmonic_type: "artificial" (armónico artificial) or "natural".
    base_string: the string to touch (1=high E … 6=low E).
    node_fret: the fret number to touch lightly (e.g. 12 for octave harmonic).

    MusicXML 4.0 element: <harmonic><artificial/></harmonic> inside <technical>.
    """
    root = _parse_xml(musicxml)
    note = _note_at(root, measure, beat)
    if note is None:
        return musicxml

    tech = _get_or_create_technical(note)
    harm_tag = _make_tag(tech, "harmonic")
    harm_el = ET.SubElement(tech, harm_tag)

    type_tag = _make_tag(harm_el, harmonic_type)
    ET.SubElement(harm_el, type_tag)

    if base_string is not None:
        s_el = ET.SubElement(tech, _make_tag(tech, "string"))
        s_el.text = str(base_string)
    if node_fret is not None:
        f_el = ET.SubElement(tech, _make_tag(tech, "fret"))
        f_el.text = str(node_fret)

    return _serialise(root, musicxml)


def add_golpe(
    musicxml: str,
    *,
    measure: int,
    beat: float,
    zone: str = "soundboard",
) -> str:
    """Add a golpe (percussive tap) marking at (measure, beat).

    Uses MusicXML 4.0 <other-technical> with value "golpe" and an
    optional placement note. In engraving it renders as a '+' above
    the staff or a small 'x' notehead on a dedicated percussion line.

    zone: "soundboard" (tapa) or "strings" (tapping the strings).
    """
    root = _parse_xml(musicxml)
    note = _note_at(root, measure, beat)
    if note is None:
        return musicxml

    tech = _get_or_create_technical(note)
    el = ET.SubElement(tech, _make_tag(tech, "other-technical"))
    el.text = f"golpe-{zone}"

    return _serialise(root, musicxml)


def add_left_hand_fingering(
    musicxml: str,
    *,
    measure: int,
    beat: float,
    finger: int,
) -> str:
    """Add left-hand finger number (0=open string, 1–4) at (measure, beat).

    Uses MusicXML <fingering> inside <technical>.
    """
    if finger not in (0, 1, 2, 3, 4):
        raise ValueError(f"finger must be 0–4, got {finger}")
    root = _parse_xml(musicxml)
    note = _note_at(root, measure, beat)
    if note is None:
        return musicxml

    tech = _get_or_create_technical(note)
    el = ET.SubElement(tech, _make_tag(tech, "fingering"))
    el.text = str(finger)

    return _serialise(root, musicxml)


def add_right_hand_fingering(
    musicxml: str,
    *,
    measure: int,
    beat: float,
    finger: str,
) -> str:
    """Add right-hand PIMA fingering at (measure, beat).

    finger: "p" (pulgar/thumb), "i" (índice), "m" (medio), "a" (anular).
    Uses MusicXML <pluck> inside <technical>.
    """
    valid = {"p", "i", "m", "a", "c", "x"}
    if finger.lower() not in valid:
        raise ValueError(f"finger must be one of {valid}, got {finger!r}")
    root = _parse_xml(musicxml)
    note = _note_at(root, measure, beat)
    if note is None:
        return musicxml

    tech = _get_or_create_technical(note)
    el = ET.SubElement(tech, _make_tag(tech, "pluck"))
    el.text = finger.lower()

    return _serialise(root, musicxml)


def add_string_number(
    musicxml: str,
    *,
    measure: int,
    beat: float,
    string_number: int,
) -> str:
    """Add a string number indicator (1=high E … 6=low E) at (measure, beat).

    Uses MusicXML <string> inside <technical>.
    """
    if string_number not in range(1, 7):
        raise ValueError(f"string_number must be 1–6, got {string_number}")
    root = _parse_xml(musicxml)
    note = _note_at(root, measure, beat)
    if note is None:
        return musicxml

    tech = _get_or_create_technical(note)
    el = ET.SubElement(tech, _make_tag(tech, "string"))
    el.text = str(string_number)

    return _serialise(root, musicxml)


def add_barre(
    musicxml: str,
    *,
    measure_start: int,
    measure_end: int,
    fret: int,
    half_barre: bool = False,
) -> str:
    """Add a barre (cejilla) indication spanning measure_start..measure_end.

    Adds a <direction> text element "BIII" / "½BIII" style on the first note
    of measure_start and "─┐" at measure_end.  MusicXML has no native barre
    element, so we use a <words> direction, which is the standard notation
    software approach.
    """
    root = _parse_xml(musicxml)
    prefix = "½B" if half_barre else "B"
    roman_fret = _int_to_roman(fret)
    label_open = f"{prefix}{roman_fret}"
    label_close = "──┐"

    # Inject as <direction><direction-type><words> on first note of each bound measure
    for m_num, label in [(measure_start, label_open), (measure_end, label_close)]:
        for measure_el in _find_all(root, "measure"):
            try:
                if int(measure_el.get("number", "")) != m_num:
                    continue
            except ValueError:
                continue
            # Insert direction before the first note in this measure
            children = list(measure_el)
            insert_idx = 0
            for idx, child in enumerate(children):
                if _strip_ns(child.tag) == "note":
                    insert_idx = idx
                    break
            dir_el = ET.Element(_make_tag(measure_el, "direction"))
            dir_el.set("placement", "above")
            dt_el = ET.SubElement(dir_el, _make_tag(dir_el, "direction-type"))
            words_el = ET.SubElement(dt_el, _make_tag(dt_el, "words"))
            words_el.text = label
            measure_el.insert(insert_idx, dir_el)
            break

    return _serialise(root, musicxml)


def add_ligado_slur(
    musicxml: str,
    *,
    measure_start: int,
    beat_start: float,
    measure_end: int,
    beat_end: float,
) -> str:
    """Add a slur (ligado) spanning from (measure_start, beat_start) to (measure_end, beat_end).

    Uses MusicXML <slur type="start"> … <slur type="stop"> inside <notations>.
    This covers both hammer-ons (ligado ascendente) and pull-offs (ligado descendente).
    """
    root = _parse_xml(musicxml)
    slur_number = 1

    start_note = _note_at(root, measure_start, beat_start)
    stop_note = _note_at(root, measure_end, beat_end)

    if start_note is not None:
        notations = _find_first(start_note, "notations")
        if notations is None:
            notations = ET.SubElement(start_note, _make_tag(start_note, "notations"))
        sl = ET.SubElement(notations, _make_tag(notations, "slur"))
        sl.set("type", "start")
        sl.set("number", str(slur_number))
        sl.set("placement", "above")

    if stop_note is not None:
        notations = _find_first(stop_note, "notations")
        if notations is None:
            notations = ET.SubElement(stop_note, _make_tag(stop_note, "notations"))
        sl = ET.SubElement(notations, _make_tag(notations, "slur"))
        sl.set("type", "stop")
        sl.set("number", str(slur_number))

    return _serialise(root, musicxml)


def add_snap_pizzicato(
    musicxml: str,
    *,
    measure: int,
    beat: float,
) -> str:
    """Add a Bartók (snap) pizzicato marking at (measure, beat).

    Uses MusicXML <snap-pizzicato> inside <technical>.
    """
    root = _parse_xml(musicxml)
    note = _note_at(root, measure, beat)
    if note is None:
        return musicxml

    tech = _get_or_create_technical(note)
    ET.SubElement(tech, _make_tag(tech, "snap-pizzicato"))

    return _serialise(root, musicxml)


def add_tonal_colour(
    musicxml: str,
    *,
    measure: int,
    technique: str,
) -> str:
    """Add a tonal-colour direction at the start of a measure.

    technique: "sul_ponticello" | "sul_tasto" | "naturale" | "con_sordino" |
               "tremolo" | "apoyando" | "tirando" | "rasgueado"

    Rendered as a <direction><words> text above the staff.
    """
    labels: dict[str, str] = {
        "sul_ponticello": "sul pont.",
        "sul_tasto": "sul tasto",
        "naturale": "nat.",
        "con_sordino": "con sord.",
        "tremolo": "trem.",
        "apoyando": "ap.",
        "tirando": "tir.",
        "rasgueado": "rasg.",
    }
    label = labels.get(technique, technique)

    root = _parse_xml(musicxml)
    for measure_el in _find_all(root, "measure"):
        try:
            if int(measure_el.get("number", "")) != measure:
                continue
        except ValueError:
            continue

        children = list(measure_el)
        insert_idx = next(
            (idx for idx, child in enumerate(children) if _strip_ns(child.tag) == "note"),
            0,
        )
        dir_el = ET.Element(_make_tag(measure_el, "direction"))
        dir_el.set("placement", "above")
        dt_el = ET.SubElement(dir_el, _make_tag(dir_el, "direction-type"))
        words_el = ET.SubElement(dt_el, _make_tag(dt_el, "words"))
        words_el.set("font-style", "italic")
        words_el.text = label
        measure_el.insert(insert_idx, dir_el)
        break

    return _serialise(root, musicxml)


def add_tremolo(
    musicxml: str,
    *,
    measure: int,
    beat: float,
    strokes: int = 3,
) -> str:
    """Add a tremolo marking (finger tremolo on a single string) at (measure, beat).

    strokes: number of slashes (3 = standard guitar tremolo notation).
    Uses MusicXML <tremolo type="single"> inside <ornaments> inside <notations>.
    """
    root = _parse_xml(musicxml)
    note = _note_at(root, measure, beat)
    if note is None:
        return musicxml

    notations = _find_first(note, "notations")
    if notations is None:
        notations = ET.SubElement(note, _make_tag(note, "notations"))
    ornaments = _find_first(note, "ornaments")
    if ornaments is None:
        ornaments = ET.SubElement(notations, _make_tag(notations, "ornaments"))
    trem = ET.SubElement(ornaments, _make_tag(ornaments, "tremolo"))
    trem.set("type", "single")
    trem.text = str(strokes)

    return _serialise(root, musicxml)


# ---------------------------------------------------------------------------
# Batch operations — apply a list of technique annotations at once
# ---------------------------------------------------------------------------

def apply_techniques(
    musicxml: str,
    techniques: list[dict[str, Any]],
) -> str:
    """Apply a batch of guitar technique annotations.

    Each item in `techniques` is a dict with a "type" key plus any
    keyword arguments for the corresponding function:

        {"type": "harmonic", "measure": 3, "beat": 1.0, "harmonic_type": "artificial", "node_fret": 12}
        {"type": "golpe",    "measure": 5, "beat": 3.0}
        {"type": "slur",     "measure_start": 7, "beat_start": 1.0,
                             "measure_end": 7, "beat_end": 3.0}
        {"type": "barre",    "measure_start": 9, "measure_end": 12, "fret": 5}
        {"type": "tonal",    "measure": 13, "technique": "sul_ponticello"}
        {"type": "lh_finger","measure": 2, "beat": 2.0, "finger": 3}
        {"type": "rh_finger","measure": 2, "beat": 2.0, "finger": "i"}
        {"type": "snap_pizz","measure": 15, "beat": 1.0}
        {"type": "tremolo",  "measure": 17, "beat": 1.0, "strokes": 3}

    Returns the final modified MusicXML after all annotations are applied.
    """
    _DISPATCH = {
        "harmonic": add_harmonic,
        "golpe": add_golpe,
        "lh_finger": add_left_hand_fingering,
        "rh_finger": add_right_hand_fingering,
        "string": add_string_number,
        "barre": add_barre,
        "slur": add_ligado_slur,
        "snap_pizz": add_snap_pizzicato,
        "tonal": add_tonal_colour,
        "tremolo": add_tremolo,
    }
    result = musicxml
    for spec in techniques:
        spec = dict(spec)
        ttype = spec.pop("type")
        fn = _DISPATCH.get(ttype)
        if fn is None:
            continue
        result = fn(result, **spec)
    return result


# ---------------------------------------------------------------------------
# Guitar transposition helper
# ---------------------------------------------------------------------------

def ensure_guitar_transpose(musicxml: str) -> str:
    """Ensure the score contains a <transpose> element for guitar.

    Classical guitar sounds an octave lower than written:
      <transpose><diatonic>-7</diatonic><chromatic>-12</chromatic></transpose>

    If no <transpose> is found in any <part-list> or <part>, this function
    adds it to the first part. Safe to call multiple times (idempotent).
    """
    root = _parse_xml(musicxml)
    existing = _find_all(root, "transpose")
    if existing:
        return musicxml

    # Find the first <part> and insert transpose in its first measure attributes
    for part in _find_all(root, "part"):
        for measure in _find_all(part, "measure"):
            attrs_el = _find_first(measure, "attributes")
            if attrs_el is None:
                attrs_el = ET.Element(_make_tag(measure, "attributes"))
                measure.insert(0, attrs_el)
            trans = ET.SubElement(attrs_el, _make_tag(attrs_el, "transpose"))
            diat = ET.SubElement(trans, _make_tag(trans, "diatonic"))
            diat.text = "-7"
            chrom = ET.SubElement(trans, _make_tag(trans, "chromatic"))
            chrom.text = "-12"
            return _serialise(root, musicxml)

    return musicxml


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

def _int_to_roman(n: int) -> str:
    vals = [(10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]
    result = ""
    for value, numeral in vals:
        while n >= value:
            result += numeral
            n -= value
    return result


__all__ = [
    "add_barre",
    "add_golpe",
    "add_harmonic",
    "add_left_hand_fingering",
    "add_ligado_slur",
    "add_right_hand_fingering",
    "add_snap_pizzicato",
    "add_string_number",
    "add_tonal_colour",
    "add_tremolo",
    "apply_techniques",
    "ensure_guitar_transpose",
]
