# Reference Composers

> The curated set of composers Stockhausen's style-transfer system targets. The agent's "Composer Vector" (Pillar 1) is steered toward these styles. Each composer gets an idiom profile and, eventually, a LoRA adapter.
>
> The maintainer will expand this list over time. Treat it as alive.

---

## Tier 1 — Initial roster (Phase 3 target)

| # | Composer | Years | Why on this list |
|---|---|---|---|
| 1 | **Sergei Rachmaninoff** | 1873–1943 | Late-Romantic harmonic richness; sweeping melodies; expansive piano writing; modal inflections from Russian Orthodox chant; chromatic voice-leading; arpeggiated textures. The "give it a Rachmaninoff touch" prompt is the original spark of this project. |
| 2 | **Claude Debussy** | 1862–1918 | Impressionist harmony (extended chords, parallel motion, modal scales — whole-tone, pentatonic, octatonic); colored orchestration; non-functional progressions; rhythmic fluidity. Essential counterweight to functional-tonality models. |
| 3 | **Johann Sebastian Bach** | 1685–1750 | Counterpoint, voice-leading rigor, fugal architecture, chorale-style harmonization. The bedrock of any composition agent that takes theory seriously. |
| 4 | **Leo Brouwer** | 1939– | Cuban; *the* modern voice for solo guitar composition; idiomatic guitar writing across tonal, modal, atonal, and minimalist languages; folkloric integration. Critical for the maintainer's instrument. |
| 5 | **Nikolai Rimsky-Korsakov** | 1844–1908 | The orchestrator's orchestrator (his treatise *Principles of Orchestration* is still the reference text). Octatonic harmony (the "Rimsky-Korsakov scale"); programmatic color; Russian folkloric idioms. |
| 6 | **Manuel M. Ponce** | 1882–1948 | Mexican; renowned guitar writing (the *Sonatas*, *Variaciones sobre "Folía de España"*); fusion of European late-Romantic language with Latin American folk material. Pairs with Brouwer for a strong Latin-American axis. |

---

## Profile schema (what each composer eventually carries)

For Phase 3 every composer in the roster gets a structured profile. The schema:

```yaml
composer:
  id: rachmaninoff
  display_name: Sergei Rachmaninoff
  years: [1873, 1943]
  public_domain_us: true            # everything pre-1925 is PD in the US
  tradition: russian_late_romantic

style_features:
  harmony:
    - extended_dominants
    - chromatic_voice_leading
    - modal_borrowing (parallel minor)
    - russian_orthodox_modal_inflections
    - secondary_dominants_chains
  melody:
    - wide_intervallic_leaps_resolved_stepwise
    - long_arching_phrases
    - sequential_motivic_development
  rhythm:
    - cross_rhythms (2-against-3, 3-against-4)
    - rubato (notated and implied)
  texture:
    - dense_arpeggiated_piano_textures
    - polyphonic_inner_voices
  orchestration:
    - thick_brass_doubling
    - violins_divisi
    - extensive_use_of_lower_strings_for_warmth
  ornamentation:
    - chromatic_appoggiaturas
    - turns_at_phrase_peaks

reference_works:
  - "Piano Concerto No. 2 in C minor, Op. 18 (1900–1901)"
  - "Piano Concerto No. 3 in D minor, Op. 30 (1909)"
  - "Symphony No. 2 in E minor, Op. 27 (1906–1907)"
  - "Preludes, Op. 23 & Op. 32"
  - "Études-Tableaux, Op. 33 & Op. 39"

vector_steering:
  base_model: moonbeam
  lora_adapter: rachmaninoff_lora_v1
  inference_intensity_default: 0.45
```

Phase 3 builds these profiles. Phase 1 and Phase 2 just keep the list informed.

---

## Working notes

- **Pre-1925 = US public domain.** Of the initial six, Rachmaninoff and Rimsky-Korsakov are firmly PD; Bach is utterly PD; Debussy is fully PD; Ponce's earliest works are PD, later works are not in all jurisdictions; Brouwer is **living and copyrighted** — for personal use this is fine; if posture ever changes to public/commercial, we revisit.
- **Personal-use posture** (NORTH_STAR §13) means we can freely study, transcribe, and learn from any composer's score for the maintainer's own composition work. We just never publish derivatives.
- **Future additions the maintainer will share.** Add them below as they arrive.

---

## Backlog (to add when the maintainer shares)

*(empty — awaiting input)*

---

## Changelog

- **2026-05-13** — Initial roster (Rachmaninoff, Debussy, Bach, Brouwer, Rimsky-Korsakov, Ponce). Profile schema drafted. Awaiting expansion.
