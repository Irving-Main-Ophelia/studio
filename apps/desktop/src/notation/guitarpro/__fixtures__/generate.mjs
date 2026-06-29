/**
 * Regenerate `sample.gp` — a small, self-minted Guitar Pro 7 binary fixture for the
 * A7 import round-trip test. We own this file (it is not copyrighted content); it is
 * produced from alphaTex via alphaTab's Gp7Exporter so the binary `.gp` parse path
 * (ScoreLoader.loadScoreFromBytes) is exercised, not just the alphaTex path.
 *
 * Run from apps/desktop:  node src/notation/guitarpro/__fixtures__/generate.mjs
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as at from "@coderline/alphatab";

const tex =
  '\\title "Sample Tab" \\tempo 96 . ' +
  "\\tuning e5 b4 g4 d4 a3 e3 . " +
  "0.1.4 3.1.4 5.1.4 r.4 | 0.2.2 2.2.2";

const imp = new at.importer.AlphaTexImporter();
imp.initFromString(tex, new at.Settings());
const score = imp.readScore();

const bytes = new at.exporter.Gp7Exporter().export(score, new at.Settings());
const out = fileURLToPath(new URL("./sample.gp", import.meta.url));
writeFileSync(out, Buffer.from(bytes));
console.log(`wrote ${out} (${bytes.length} bytes)`);
