"""Guitar style registry for "Variaciones sobre un tema de Chan Cil".

Each entry describes one of the eight movements (Tema + 6 Variaciones + Coda)
with enough musical intelligence for Claude to generate idiomatic content.

The registry is consumed by:
  - routes/style.py  (POST /style/apply endpoint, replaces LoRA stubs)
  - generator.py     (guitar-specific generation constraints)
  - agent_tools.py   (score_add_section plan enrichment)

Structure of each style entry:
  id              — machine key, used in API calls
  display_name    — user-facing label
  movement        — movement number in the piece (0 = Tema)
  duration_sec    — target duration in seconds
  time_signature  — suggested meter (e.g. "3/4", "4/4", "5/8")
  key             — tonal centre (written pitch, guitar transposes automatically)
  tempo_marking   — Italian marking + BPM range
  character       — one-line emotional / expressive target
  model_composer  — the historical reference voice
  language_rules  — specific musical language rules for Claude
  technique_rules — required and forbidden technical markings
  structure       — formal outline (sections, bar counts)
  generation_prompt — a complete free-text system-prompt addendum that
                      Claude prepends to any score-generation task for
                      this movement.
"""

from __future__ import annotations

from typing import Any

# ---------------------------------------------------------------------------
# Style entries
# ---------------------------------------------------------------------------

GUITAR_STYLES: list[dict[str, Any]] = [
    # ── 0. Tema ──────────────────────────────────────────────────────────────
    {
        "id": "chan_cil_tema",
        "display_name": "Tema — Vuelvo a ti, amada mía",
        "movement": 0,
        "duration_sec": 120,
        "time_signature": "3/4",
        "key": "A major",
        "tempo_marking": "Andante cantabile (♩ = 56–66)",
        "character": (
            "Memorable, cantabile, almost popular. The melody must be singable "
            "by any listener on first hearing. Warm, intimate, slightly nostalgic."
        ),
        "model_composer": "Trova yucateca (Chan Cil style)",
        "language_rules": [
            "Strict diatonicism in A major / E major. No chromatic alterations except "
            "occasional leading-tone raised 7th.",
            "Habanera or vals-yucateco rhythmic feel is idiomatic: dotted quarter + "
            "eighth patterns, occasional syncopation across the barline.",
            "Melody in the upper voice, stems up. Simple bass alternation (root on "
            "beat 1, fifth/third on beats 2–3) in the lower voice, stems down.",
            "Phrase lengths: 4+4 bar periods. Two periods = one section (A). "
            "Form: A A B A, total ~32 bars.",
            "End each A-section with a clear authentic cadence (V7–I). "
            "B-section may touch the relative minor (F# minor) briefly.",
            "Dynamics: mp–mf, no extremes. This is intimate music.",
        ],
        "technique_rules": [
            "Right hand: tirando (free stroke) for melody, apoyando (rest stroke) only "
            "on the most important melodic notes.",
            "No extended techniques in the Tema. Pure classical fingerstyle.",
            "Mark all slurs carefully — the trova style uses smooth phrase connections.",
            "Use open strings where idiomatic (E, A, D strings in A major).",
        ],
        "structure": "A A B A — 8+8+8+8 bars — each section ends with authentic cadence",
        "generation_prompt": (
            "Generate a solo classical guitar piece in the trova yucateca style. "
            "The melody should be immediately singable — simple, diatonic, warm. "
            "Key: A major (written pitch; guitar sounds one octave lower). "
            "Time: 3/4. Tempo: Andante cantabile, quarter = 60. "
            "Texture: melody in the top voice (stems up), simple bass in the lower voice "
            "(stems down). "
            "\n\n"
            "RHYTHMIC CELLS — USE THESE EXACT PATTERNS IN THE BASS/INNER VOICE:\n"
            "Vals yucateco cell (3/4) — the defining texture of trova:\n"
            "  Beat 1: bass root note, quarter duration (apoyando, forte)\n"
            "  Beat 2: inner chord note, eighth duration (tirando, piano)\n"
            "  Beat 2+: inner chord note, eighth duration (tirando, piano)\n"
            "  Beat 3: inner chord note, quarter duration (tirando, piano)\n"
            "  In music21 code for one measure of A major:\n"
            "    v2 = stream.Voice(); v2.id = 2\n"
            "    bass = note.Note('A2'); bass.duration.quarterLength = 1.0\n"
            "    e1 = note.Note('E3'); e1.duration.quarterLength = 0.5\n"
            "    e2 = note.Note('C#3'); e2.duration.quarterLength = 0.5\n"
            "    e3 = note.Note('E3'); e3.duration.quarterLength = 1.0\n"
            "    v2.append([bass, e1, e2, e3])\n"
            "\n"
            "Habanera/syncopation cell — use for phrase pick-ups and transitions:\n"
            "  Dotted quarter + eighth + quarter across the 3/4 bar creates\n"
            "  the syncopated forward momentum of Chan Cil.\n"
            "  In music21:\n"
            "    n1 = note.Note('E4'); n1.duration.quarterLength = 1.5  # dotted quarter\n"
            "    n2 = note.Note('F#4'); n2.duration.quarterLength = 0.5  # eighth\n"
            "    n3 = note.Note('A4'); n3.duration.quarterLength = 1.0  # quarter\n"
            "\n"
            "Form: A A B A, 32 bars total (8+8+8+8). "
            "A-section stays in A major, ends V7-I. "
            "B-section opens in F# minor (vi of A major), returns to A major. "
            "Phrase endings on clear V–I cadences. "
            "No extended techniques. Use slurs generously to connect melodic notes. "
            "The emotional target: intimacy, nostalgia, folk warmth. Not flashy — "
            "this is the theme the variations will transform."
        ),
    },

    # ── 1. Variación 1 — Pequeño Cirilo (Tárrega) ────────────────────────────
    {
        "id": "var1_tarrega",
        "display_name": "Variación 1 — Pequeño Cirilo (Tárrega)",
        "movement": 1,
        "duration_sec": 90,
        "time_signature": "2/4",
        "key": "A major",
        "tempo_marking": "Andantino grazioso (♩ = 72–84)",
        "character": (
            "Childhood nostalgia. Intimate and playful, never caricature. "
            "Delicate ornaments, light texture, juguetón (playful)."
        ),
        "model_composer": "Francisco Tárrega (Recuerdos de la Alhambra, Capricho Árabe, Lágrima)",
        "language_rules": [
            "Diatonic A major with occasional chromatic passing tones (C#–D–D#–E type "
            "chromatic approaches). Tárrega's harmonic language is late-Romantic but "
            "never shocking — always returns to home.",
            "Melodic material: direct quotation of the Chan Cil Tema melody, ornamented "
            "with appoggiaturas, turns (grupetti), and mordents.",
            "Accompaniment: pizzicato-like detached inner voices (staccato on offbeats), "
            "NOT arpeggiated — a light, dance-like pulse.",
            "Form A–A' (16+16 bars). A' is the same as A but with additional ornaments "
            "and a richer harmonic close.",
            "One brief excursion to the dominant key (E major) in bars 9–12.",
        ],
        "technique_rules": [
            "Pizzicato indication near the soundhole for the inner voice accompaniment. "
            "Mark 'pizz.' at the start; restore with 'nat.' before the final phrase.",
            "Apoyando (rest stroke) for the melody — mark 'ap.' at the start.",
            "Left-hand ornaments: trills (tr~), mordents, short appoggiatura grace notes. "
            "Slurs on all ornaments.",
            "Use string indicators where position is unusual (e.g. sul IV string for "
            "colour in the middle section).",
            "Dynamics: p–mp throughout; crescendo only to mf at the A' section return.",
        ],
        "structure": "A A' — 16+16 bars — A' has richer ornaments and fuller close",
        "generation_prompt": (
            "Generate a solo classical guitar miniature in the style of Francisco Tárrega. "
            "This is Variación 1 on a trova yucateca theme (A major). "
            "Key: A major (written). Time: 2/4. Tempo: Andantino grazioso, quarter = 76. "
            "The Chan Cil melody appears in the upper voice, ornamented with appoggiaturas, "
            "turns, and trills. Accompaniment: light staccato inner voices (pizzicato effect). "
            "Apply apoyando marking to the melody. "
            "Form: A A', 32 bars. A' repeats A with additional ornaments. "
            "Character: childhood nostalgia, playful but intimate. "
            "Include a brief modulation to E major (dominant) in bars 9–12, returning "
            "to A major for the close. Richer harmonic colour in A' with chromatic "
            "approaches. End with a quiet, settled authentic cadence."
        ),
    },

    # ── 2. Variación 2 — Autodidacta (Brouwer) ───────────────────────────────
    {
        "id": "var2_brouwer",
        "display_name": "Variación 2 — Autodidacta (Brouwer)",
        "movement": 2,
        "duration_sec": 150,
        "time_signature": "variable",
        "key": "atonal / A as anchor pitch",
        "tempo_marking": "Inquieto, senza misura (♩ = 80 → accelerando to 132)",
        "character": (
            "The most experimental, abstract, and intellectual variation. "
            "Chaos that grows from a single cell. Not random — everything is derived."
        ),
        "model_composer": (
            "Leo Brouwer — Espiral Eterna, Estudios Sencillos VI–X, "
            "La Espiral Eterna (Fibonacci expansion), Canticum"
        ),
        "language_rules": [
            "Reduce the Chan Cil Tema to its smallest interval cell: the opening "
            "interval (likely a 2nd or 3rd). This cell is the entire thematic material.",
            "Fibonacci expansion: the cell grows according to the sequence 1, 1, 2, 3, 5, "
            "8 in terms of note count per gesture. First gesture = 1 note. Second = 1 note. "
            "Third = 2 notes. Fourth = 3 notes. Continue.",
            "Metric displacement: each repetition of the cell enters on a different beat. "
            "Time signatures change frequently (2/4, 3/8, 5/8, 4/4 free).",
            "The pitch content expands outward from A: first only A, then A+B, then "
            "A+G#+B, etc. — registral expansion mirrors the Fibonacci growth.",
            "Silence is structural. Rests between cells are as important as the cells.",
            "Climax at approximately bar 20–24: full Fibonacci row, all registered, "
            "maximum textural density. Then sudden collapse to a single repeated A.",
        ],
        "technique_rules": [
            "Golpes (tap on soundboard): mark at points of metric stress to replace "
            "harmonic attack. Use 'golpe' indication.",
            "Artificial harmonics: at the climax, 2–3 harmonic notes to expand register "
            "above normal range. Mark with diamond noteheads and fret numbers.",
            "Ligados veloces (fast hammer-ons/pull-offs) for the expanding cells. "
            "Mark all with slur brackets.",
            "Sul ponticello (sul pont.) for passages of tension. Return with 'nat.'",
            "No vibrato markings (non vibrato is implied by the ascetic texture).",
            "Dynamic range: pppp to fff. Full dynamic spectrum used.",
        ],
        "structure": (
            "Through-composed — 32 bars. "
            "Bars 1–8: seed (cell introduced). "
            "Bars 9–16: growth (Fibonacci expansion, metric displacement). "
            "Bars 17–24: climax (maximum density, full register, sul pont., golpes). "
            "Bars 25–32: collapse (decrescendo to single repeated A, near silence)."
        ),
        "generation_prompt": (
            "Generate a solo classical guitar study in the style of Leo Brouwer's "
            "Espiral Eterna. This is Variación 2 on the Chan Cil tema (the most abstract "
            "and experimental variation). "
            "Extract the opening interval of the tema as a minimum cell (2 notes). "
            "Build the entire piece by Fibonacci expansion of this cell: each subsequent "
            "gesture adds notes according to the sequence 1,1,2,3,5,8. "
            "Metric structure changes frequently: alternate 2/4, 3/8, 5/8, 4/4. "
            "Register expands outward from the central A pitch. "
            "Extended techniques required: golpe markings at climax moments, "
            "artificial harmonics for the highest register, ligado slurs for all "
            "rapid passages, sul ponticello for tension sections. "
            "Form: 32 bars. Seed (1–8), Growth (9–16), Climax (17–24), Collapse (25–32). "
            "The collapse ends on a single pppp repeated A — the same pitch the tema began on. "
            "This variation should feel like scientific dissection and reorganisation "
            "of the melody's DNA."
        ),
    },

    # ── 3. Variación 3 — Bohemio (Ponce) ─────────────────────────────────────
    {
        "id": "var3_ponce",
        "display_name": "Variación 3 — Bohemio (Ponce)",
        "movement": 3,
        "duration_sec": 120,
        "time_signature": "4/4",
        "key": "A minor / C major (parallel minor shift)",
        "tempo_marking": "Adagio expressivo (♩ = 46–54)",
        "character": (
            "The most painful, romantic, and heartbreaking variation. "
            "It must hurt. Rich post-Romantic harmony, singing melody, inner voices "
            "that breathe and ache."
        ),
        "model_composer": (
            "Manuel M. Ponce — Sonata III, Scherzino Mexicano, "
            "Thème varié et finale, Sonatina Meridional"
        ),
        "language_rules": [
            "Modulate to A minor (parallel minor) at the start. This is the emotional "
            "turning point of the entire piece.",
            "Harmony: post-Romantic, impressionist-adjacent. Secondary dominants, "
            "Neapolitan chord (bII in A minor = Bb major), augmented sixth chords. "
            "Modal mixture (borrow from A major freely).",
            "Melody: the Chan Cil Tema in the top voice, but now slower and weighted "
            "with grief. Long note values, stretched phrase arches.",
            "Texture: melody + rich inner voice counterpoint. The inner voices have "
            "their own melodic interest — not mere accompaniment. "
            "The bass moves in contrary motion to the melody at key moments.",
            "No sudden changes — everything is gradual, prolonged, inevitable.",
            "Climax: a single ff chord in bar 18–20 (the most dissonant point). "
            "Then gradual withdrawal, ending in a whispered A minor cadence.",
        ],
        "technique_rules": [
            "Apoyando (rest stroke) for the melody throughout. Mark 'ap.' at start.",
            "Right-hand: p on bass, i-m-a arpeggiation on inner + melody voices.",
            "No golpes or harmonics — pure lyrical playing.",
            "Vibrato: 'vib.' marking on the melody's longest notes (quarter+).",
            "Dynamics: start mp, swell to ff at climax, die to ppp at the end.",
            "Molto rubato: the tempo is very free. Mark 'molto rubato' and 'senza misura' "
            "for the most expressive phrases.",
        ],
        "structure": (
            "Through-composed — 24 bars. "
            "Bars 1–8: presentation (A minor, melody in top voice, rising tension). "
            "Bars 9–16: development (modulation to C major then back, bII chord, "
            "climax at bar 16–18). "
            "Bars 17–24: recapitulation + dissolution (return to A minor, ppp close)."
        ),
        "generation_prompt": (
            "Generate a solo classical guitar piece in the style of Manuel M. Ponce's "
            "Sonata III and Thème varié. This is Variación 3 — the most painful, romantic, "
            "and heartbreaking variation. "
            "Key: A minor (parallel minor shift from the tema's A major). "
            "Time: 4/4. Tempo: Adagio expressivo, quarter = 50. Molto rubato throughout. "
            "The Chan Cil melody appears in the top voice, with long note values and "
            "rich post-Romantic harmonisation. Inner voices move with their own melodic "
            "interest. Bass in contrary motion to the melody at climax moments. "
            "Harmony: secondary dominants, Neapolitan chord (Bb major in A minor), "
            "augmented sixth chords, modal mixture from A major. "
            "Climax: single ff dissonant chord around bar 18. Then slow withdrawal. "
            "End ppp, hushed A minor authentic cadence. "
            "This must be the emotional centre of the piece. It should hurt."
        ),
    },

    # ── 4. Variación 4 — Improvisador / Obra Perdida (Dyens / Domeniconi) ────
    {
        "id": "var4_dyens",
        "display_name": "Variación 4 — Improvisador / Obra Perdida (Dyens/Domeniconi)",
        "movement": 4,
        "duration_sec": 150,
        "time_signature": "free / rubatissimo",
        "key": "A major / modal (Lydian / Phrygian inflections)",
        "tempo_marking": "Capriccioso, libero (♩ = 92 référence, freely deviated)",
        "character": (
            "The most virtuosic, unstable, and dangerous variation. "
            "Apparent improvisation. Fragments that start and don't finish. "
            "The score exists but the performer seems to be discovering it."
        ),
        "model_composer": (
            "Roland Dyens (Tango en Skaï, Libra Sonatine), "
            "Carlo Domeniconi (Koyunbaba, Ciaccona)"
        ),
        "language_rules": [
            "Melodic material: fragments of the Chan Cil Tema that begin, break off, "
            "restart from a different pitch, or suddenly change character. "
            "Never complete a phrase before interrupting it.",
            "Modal inflections: Lydian (#4) for 'bright' passages, Phrygian (bII, b2) "
            "for 'dark' passages, diatonic A major for 'home' returns.",
            "Polyrhythm implicit: the written meter is 4/4 but the melodic phrasing "
            "suggests 3/4 and 5/4 simultaneously (hemiola).",
            "Sudden dynamic changes (p → fff → pp) with no preparation.",
            "Extended silence: 2–4 beats of complete rest in unexpected places, "
            "as if the improviser lost their train of thought.",
            "The piece ends on a major 7th chord (A major 7) — unresolved.",
        ],
        "technique_rules": [
            "Ligados veloces (lightning-fast hammer-on/pull-off chains). "
            "Mark all with slurs. These are the signature gesture.",
            "Position shifts: abrupt jumps from low to high register with no transition. "
            "Mark 'position V', 'position XII' etc. for performer orientation.",
            "Implicit polyrhythm notation: write in 4/4 but use tuplets (3-against-4, "
            "5-against-4) to create the feeling of multiple simultaneous meters.",
            "Snap pizzicato (Bartók) at two points: one near the start for shock effect, "
            "one near the end for final destabilisation.",
            "Sul ponticello on the fast ligado passages for metallic, etched quality.",
            "Tempo: large ritardando markings followed by sudden 'a tempo' are structural.",
        ],
        "structure": (
            "Through-composed — 28 bars. "
            "Bars 1–6: opening fragment (tema interrupted twice). "
            "Bars 7–14: first development (ligado torrent, position shifts, sul pont.). "
            "Bars 15–20: false recapitulation (tema starts in A major, then derails). "
            "Bars 21–28: coda-within-variation (polyrhythm, snap pizzicato, "
            "ends on unresolved Amaj7)."
        ),
        "generation_prompt": (
            "Generate a solo classical guitar piece in the style of Roland Dyens and "
            "Carlo Domeniconi. This is Variación 4 — the most virtuosic and unstable variation. "
            "Key: A major with Lydian and Phrygian modal inflections. "
            "Time: 4/4 written, but the musical feeling is metrically free. "
            "Tempo: Capriccioso libero, roughly quarter = 92 but freely deviated. "
            "The Chan Cil melody appears as interrupted fragments — phrases begin but "
            "are cut off, restarted, or suddenly redirected. "
            "Extended techniques: fast ligado chains (mark all slurs), snap pizzicato "
            "at bar 3 and bar 24, sul ponticello on fast passages. "
            "Implied polyrhythm via tuplets (3:4, 5:4). "
            "Large sudden dynamic contrasts. Extended silences (2–4 beats). "
            "Ends on an unresolved Amaj7 chord — no resolution. "
            "This variation should feel like watching someone improvise a piece "
            "they have almost forgotten."
        ),
    },

    # ── 5. Variación 5 — Padre de la Trova (Sor / Giuliani) ──────────────────
    {
        "id": "var5_sor",
        "display_name": "Variación 5 — Padre de la Trova (Sor/Giuliani)",
        "movement": 5,
        "duration_sec": 90,
        "time_signature": "3/4",
        "key": "A major",
        "tempo_marking": "Allegretto grazioso (♩ = 88–100)",
        "character": (
            "For the first time in the piece, everything makes sense. "
            "The canon appears. Order, elegance, clarity. Authority — not severity. "
            "After the chaos, this is the revelation of the underlying law."
        ),
        "model_composer": (
            "Fernando Sor (Variations on a theme by Mozart Op.9, Studies), "
            "Mauro Giuliani (Sonata Op.15, Rossiniana)"
        ),
        "language_rules": [
            "Classical form: strict 8-bar periods with clear phrase beginnings and endings. "
            "Every phrase ends with a cadence (half or authentic).",
            "Harmonic vocabulary: purely functional. I, IV, V, V7, ii, vi only. "
            "No chromatic alterations. No secondary dominants.",
            "Melody + bass counterpoint: the upper voice carries the Chan Cil Tema; "
            "the bass provides a countermelody of equal importance (canon-like). "
            "The two voices should be audible as independent lines.",
            "Regular arpeggiation in the accompaniment: p–i–m–a or p–a–m–i patterns "
            "(Giuliani's 120 right-hand exercises pattern nos. 3, 5, 7).",
            "Dynamics: balanced, mp throughout, clear phrase shaping. No extremes.",
            "This movement has the formal clarity of a Haydn minuet.",
        ],
        "technique_rules": [
            "Right hand: elegant regular arpeggios. Write p-i-m-a fingering in bar 1 "
            "then the pattern is implied for the whole section.",
            "Bass voice: clearly articulated with p (thumb). Each bass note slightly "
            "separated (portato feel) to make the countermelody audible.",
            "Slurs only for ornamental notes (a few passing trills). No technical slurs.",
            "Position stays in lower positions (I–V) throughout — classical guitar "
            "preferred registers for period-style writing.",
        ],
        "structure": (
            "Period form — 24 bars: A (1–8) + B (9–16) + A (17–24). "
            "A: A major, melody + bass, authentic cadence bar 8. "
            "B: E major (dominant), sequential passage, half cadence bar 16. "
            "A: return, fuller arpeggio, perfect authentic cadence bar 24."
        ),
        "generation_prompt": (
            "Generate a solo classical guitar piece in the style of Fernando Sor and "
            "Mauro Giuliani. This is Variación 5 — where order and authority are finally "
            "established after chaos. "
            "Key: A major. Time: 3/4. Tempo: Allegretto grazioso, quarter = 92. "
            "The Chan Cil melody in the top voice; bass provides an independent "
            "countermelody of equal importance (the two lines form a canon-like texture). "
            "Accompaniment: regular p-i-m-a arpeggios. "
            "Strict classical form: 8-bar periods, clear V–I cadences. "
            "Harmonic vocabulary: I IV V V7 ii vi only. No chromatic notes. "
            "Three sections: A (A major), B (E major), A (return, richer). "
            "This should feel like clarity arriving after a storm — elegant and inevitable."
        ),
    },

    # ── 6. Variación 6 — Carrillo / Lo Sinfónico (Ponce/Brouwer) ─────────────
    {
        "id": "var6_sinfonico",
        "display_name": "Variación 6 — Carrillo / Lo Sinfónico (Ponce/Brouwer)",
        "movement": 6,
        "duration_sec": 90,
        "time_signature": "4/4",
        "key": "A major / chromatic expansion",
        "tempo_marking": "Maestoso, largo con fuoco (♩ = 52–60)",
        "character": (
            "Guitar taken to its absolute expressive limit. "
            "Not imitation of an orchestra — but the guitar as its own orchestra. "
            "Monumental, chromatic, dense. The entire register of the instrument."
        ),
        "model_composer": (
            "Manuel M. Ponce — Thème varié et finale, "
            "Leo Brouwer — Décaméron Negro, Concierto de Liège"
        ),
        "language_rules": [
            "The Chan Cil Tema in the bass register, heavily harmonised. "
            "The melody appears transformed: augmented (double time values), "
            "harmonised in dense 4-voice chords.",
            "Harmonic language: late Romantic / early 20th century. "
            "Chromatic voice leading. "
            "Thick sonorities: 4–6 note chords (arpeggiados). "
            "Parallel chord motion (Debussy planing) for colour passages.",
            "Full register exploitation: low bass notes (open E2, A2) supporting "
            "high melodic notes (reaching E5–A5 in written pitch).",
            "Layers: (1) bass melody in low register, (2) harmonic filler in middle, "
            "(3) high-register echo of the tema — three simultaneous layers.",
            "This is the summation: every technique learned in previous variations "
            "appears here in synthesis.",
        ],
        "technique_rules": [
            "Rasgueado on the opening bars and the climax: mark 'rasg.' and notate "
            "as chord with directional arrow.",
            "Tremolo on the high melodic line at the climax: mark 'trem.' and use "
            "three-stroke tremolo notation on the upper voice.",
            "Golpe: one powerful soundboard tap at the structural downbeat of bar 9 "
            "(the moment of maximum density).",
            "Artificial harmonics at bar 20–22 for the ethereal high-register echo "
            "of the tema. Diamond noteheads, node fret 12.",
            "Sul tasto for the soft middle section (bars 13–16) to contrast with "
            "the dense opening.",
            "Barre: full barre at fret V from bars 9–12 for the climax chord cluster.",
            "Dynamics: ff throughout most of the movement, with one mp island (sul tasto "
            "section). The piece ends fff.",
        ],
        "structure": (
            "Ternary with coda — 24 bars: "
            "A (1–8): tema in bass, dense chords, rasgueado, forte. "
            "B (9–16): climax + contrast (golpe bar 9, sul tasto bar 13–16). "
            "A' (17–22): tema returns fff, tremolo melody, full-register density. "
            "Coda (23–24): two bars, single fff A major chord, resonating."
        ),
        "generation_prompt": (
            "Generate a solo classical guitar piece in the style of Ponce's Thème varié "
            "finale and Brouwer's Décaméron Negro. This is Variación 6 — the guitar at "
            "its absolute expressive limit. "
            "Key: A major with chromatic expansion. Time: 4/4. "
            "Tempo: Maestoso, largo con fuoco, quarter = 56. "
            "The Chan Cil tema appears augmented (doubled note values) in the bass, "
            "harmonised with dense 4-voice chords. A high-register echo of the tema "
            "runs simultaneously (three layers: bass melody, middle harmony, high echo). "
            "Extended techniques: rasgueado on opening and climax, tremolo on high melody, "
            "golpe at bar 9 downbeat, artificial harmonics bars 20–22, sul tasto bars 13–16, "
            "full barre at fret V bars 9–12. "
            "Dynamics: ff throughout; one mp island (sul tasto). End fff. "
            "This is the summation — everything the piece has learned, compressed "
            "into 24 bars of maximum density."
        ),
    },

    # ── 7. Coda — Vuelvo a ti (memoria) ──────────────────────────────────────
    {
        "id": "coda_memoria",
        "display_name": "Coda — Vuelvo a ti (memoria)",
        "movement": 7,
        "duration_sec": 90,
        "time_signature": "3/4 (dissolving)",
        "key": "A major (returning, fragmented)",
        "tempo_marking": "Adagio, molto rallentando sempre (♩ = 44–54 → morendo)",
        "character": (
            "The tema returns, but not the same. After the journey through chaos, "
            "pain, order, and grandeur — the melody is now memory. "
            "Fragmented, nostalgic, dissolving into silence. "
            "The piece doesn't end — it fades away."
        ),
        "model_composer": "Synthesis of all previous styles",
        "language_rules": [
            "Return to A major, but the harmonic progression is more chromatic than "
            "in the Tema — coloured by the journey.",
            "The Chan Cil melody appears in fragments: 2–3 notes of the theme, then "
            "silence, then another fragment from a different position in the melody.",
            "Each fragment is harmonised differently: one bar in Tárrega style, the "
            "next in Ponce style, a single chord in Brouwer style. "
            "This is a kaleidoscope of memory.",
            "The bass drops away in the final 8 bars — only the melody remains, "
            "unharmonised, alone.",
            "Final note: a single open A (the tonic) held for 4 beats. Then silence.",
        ],
        "technique_rules": [
            "Mark 'sempre rallentando' at the start — the tempo slows continuously.",
            "Use artificial harmonics on the last melodic fragments (bars 20–24) "
            "for a ghostly, distant quality. Mark with diamond noteheads.",
            "Molto rubato, senza misura on the final 8 bars.",
            "Dynamics: mp → pp → ppp → pppp → (silence).",
            "Sul tasto from bar 16 onwards for the softest, most muted tone.",
            "The very last note (open A) should be marked 'lasciar vibrare' "
            "(let ring, do not damp).",
        ],
        "structure": (
            "Through-composed dissolution — 24 bars: "
            "Bars 1–8: return of tema fragments (full harmonisation, mp). "
            "Bars 9–16: fragmentation (melody alone, bass disappears, pp). "
            "Bars 17–22: ghostly harmonics (artificial harmonics, sul tasto, ppp). "
            "Bars 23–24: single open A, 'lasciar vibrare', pppp."
        ),
        "generation_prompt": (
            "Generate a solo classical guitar coda in the style of a memory dissolving. "
            "This is the final movement — after chaos, pain, order, and grandeur, "
            "the Chan Cil melody returns as a fragment of memory. "
            "Key: A major, fragmented. Time: 3/4 but freely dissolving. "
            "Tempo: Adagio, sempre rallentando, starting at quarter = 48, slowing to nothing. "
            "The tema appears in 2–3 note fragments separated by silences. "
            "Each fragment is harmonised differently: some bars Tárrega-style, "
            "some Ponce-style, a few Brouwer-style. "
            "Extended techniques: artificial harmonics on the final melody fragments "
            "(bars 20–24), sul tasto from bar 16 onwards. "
            "The bass voice disappears in bar 17 — only melody remains. "
            "Final note: single open A, marked 'lasciar vibrare', pppp. "
            "Dynamics: mp → pp → ppp → pppp → silence. "
            "This coda must feel like a memory becoming a dream becoming nothing."
        ),
    },
]


# ---------------------------------------------------------------------------
# Lookup helpers
# ---------------------------------------------------------------------------

def get_style(style_id: str) -> dict[str, Any] | None:
    """Return a style entry by id, or None if not found."""
    return next((s for s in GUITAR_STYLES if s["id"] == style_id), None)


def list_styles() -> list[dict[str, str]]:
    """Return a lightweight listing of all guitar styles."""
    return [
        {
            "id": s["id"],
            "display_name": s["display_name"],
            "movement": str(s["movement"]),
            "character": s["character"][:100] + "…",
        }
        for s in GUITAR_STYLES
    ]


__all__ = ["GUITAR_STYLES", "get_style", "list_styles"]
