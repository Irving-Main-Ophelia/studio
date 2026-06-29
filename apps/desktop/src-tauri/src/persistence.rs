//! Phase-1 (M1.0) project persistence.
//!
//! Project layout on disk (see `docs/phases/PHASE_1.md` §1.8):
//!
//! ```text
//! ~/Documents/Stockhausen/<slug>/
//! ├── project.json            (versioned metadata + last_op_index)
//! ├── score.musicxml          (current canonical state)
//! ├── operations.log          (JSONL, append-only, fsync-on-write)
//! ├── snapshots/              (periodic snapshots; populated from M1.0 onward)
//! ├── renders/                (WAV renders; written by M1.2 audio engine)
//! ├── takes/                  (audio + MIDI captures; populated in Phase 2)
//! └── exports/                (user-triggered exports; M1.5)
//! ```
//!
//! Atomic-write discipline: every write that mutates a project file goes
//! through [`atomic_write`] (`write to .tmp → fsync → rename`). The log file
//! is append-only and fsync'd after every record.
//!
//! Recovery: on open we compare `project.json#last_op_index` against the
//! line count of `operations.log`. Any extra lines are *pending* operations
//! whose intent was journalled but whose materialised state was not flushed
//! before a crash — the UI surfaces them in a recovery banner.

use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use tauri::AppHandle;
use tracing::{info, warn};
use uuid::Uuid;

/// `project.json` schema version. Bumping this requires writing a migrator
/// (see [`migrate_meta`]).
///
/// - v1: Phase-1 format (mixer = gain/pan/mute/solo + master).
/// - v2: Phase-3.5 (M3.5.2) — reserves the DAW shapes the Phase 4–8 tracks need
///   (per-track sends/inserts/group, mixer buses, master inserts, automation,
///   audio_clips, markers). All empty/defaulted until their owning phase ships;
///   reserving them now avoids a migration tax later. See ADR-0016.
/// - v3: Phase-4 (M4.0/M4.2) — adds an optional per-part `guitar` block
///   (tuning / capo / profile / view_mode) for tablature. Absent ⇒ non-fretted
///   part, standard staff (today's behaviour). See ADR-0018.
pub const SCHEMA_VERSION: u32 = 3;

/// Per-part guitar/fretted-instrument metadata. Reserved (schema v3) for Phase 4
/// (Track A). `None` on an [`InstrumentationEntry`] means a non-fretted part that
/// renders as standard staff. See ADR-0018.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuitarConfig {
    /// Open-string pitches, string 1 (highest/thinnest) first — matches MusicXML
    /// `<string>` numbering. An array so N-string instruments are data, not code.
    pub tuning: Vec<String>,
    /// Capo fret; `0` = none. Tab fret numbers are read relative to it.
    #[serde(default)]
    pub capo: u8,
    /// `nylon` | `steel` | `electric` | `bass` | `custom`.
    pub profile: String,
    /// `staff` | `tab` | `both` — how this part renders (Track A, A1).
    pub view_mode: String,
}

/// Mirrors `project.json#instrumentation[*]`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstrumentationEntry {
    pub id: String,
    pub instrument: String,
    #[serde(default)]
    pub channel: u8,
    /// Reserved (schema v3) for Phase 4 — per-part guitar metadata. Absent on
    /// non-fretted parts (kept off-disk so they stay byte-stable). See ADR-0018.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub guitar: Option<GuitarConfig>,
}

/// Mirrors `project.json#mixer.tracks[*]`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MixerTrack {
    pub id: String,
    #[serde(default)]
    pub gain_db: f32,
    #[serde(default)]
    pub pan: f32,
    #[serde(default)]
    pub mute: bool,
    #[serde(default)]
    pub solo: bool,
    /// Reserved (schema v2) for Track C / Phase 6 — send levels to aux/submix buses. Empty until then.
    #[serde(default)]
    pub sends: Vec<JsonValue>,
    /// Reserved (schema v2) for Track C — per-track insert effect chain. Empty until then.
    #[serde(default)]
    pub inserts: Vec<JsonValue>,
    /// Reserved (schema v2) for Track C — group/VCA membership. `null` until then.
    #[serde(default)]
    pub group: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MixerMaster {
    #[serde(default)]
    pub gain_db: f32,
    /// Reserved (schema v2) for Track C — master insert chain. Empty until then.
    #[serde(default)]
    pub inserts: Vec<JsonValue>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MixerState {
    #[serde(default)]
    pub tracks: Vec<MixerTrack>,
    #[serde(default)]
    pub master: MixerMaster,
    /// Reserved (schema v2) for Track C — aux/submix bus definitions. Empty until then.
    #[serde(default)]
    pub buses: Vec<JsonValue>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AgentState {
    #[serde(default)]
    pub last_seen_message_count: u32,
    #[serde(default)]
    pub pinned_explanations: Vec<String>,
}

/// Mirrors the on-disk `project.json` (schema v3 — see [`SCHEMA_VERSION`]).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMeta {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub composer: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub tempo_bpm: f64,
    pub time_signature: String,
    pub key_signature: String,
    #[serde(default)]
    pub instrumentation: Vec<InstrumentationEntry>,
    #[serde(default)]
    pub mixer: MixerState,
    #[serde(default)]
    pub agent_state: AgentState,
    #[serde(default)]
    pub composition_brief: Option<String>,
    /// Reserved (schema v2) for Track C — per-track/param automation breakpoint lanes. Empty until Phase 6.
    #[serde(default)]
    pub automation: Vec<JsonValue>,
    /// Reserved (schema v2) for Track B — references into `takes/` with offsets + clip gain. Empty until Phase 5.
    #[serde(default)]
    pub audio_clips: Vec<JsonValue>,
    /// Reserved (schema v2) for Track B — named song-position markers (tie to analyze_form). Empty until Phase 5.
    #[serde(default)]
    pub markers: Vec<JsonValue>,
    /// Index of the last operation that has been folded into `score.musicxml`.
    /// `-1` means the project is brand-new and has never had an operation.
    #[serde(default = "default_last_op_index")]
    pub last_op_index: i64,
}

fn default_schema_version() -> u32 {
    SCHEMA_VERSION
}

fn default_last_op_index() -> i64 {
    -1
}

/// Upgrade `meta` in place to the current [`SCHEMA_VERSION`]. Returns `true` when it
/// changed (so the caller rewrites `project.json`), `false` when already current.
/// Errors only on a *newer*-than-supported schema.
///
/// Both migrations so far are purely additive, so neither needs field transforms:
/// - v1 → v2: reserves the DAW shapes (per-track sends/inserts/group, mixer buses,
///   master inserts, automation, audio_clips, markers).
/// - v2 → v3: adds the optional per-part `guitar` block (ADR-0018).
/// New fields deserialise to empty/`None` via `#[serde(default)]`, so the in-memory
/// struct is already correct after parsing — migration just stamps the new version
/// (a v1 project jumps straight to v3 in one stamp). Future migrations that *do*
/// need transforms should chain stepwise here.
fn migrate_meta(meta: &mut ProjectMeta) -> Result<bool, String> {
    if meta.schema_version > SCHEMA_VERSION {
        return Err(format!(
            "Unsupported project schema_version {} (this build expects {SCHEMA_VERSION}). Update Stockhausen.",
            meta.schema_version
        ));
    }
    if meta.schema_version == SCHEMA_VERSION {
        return Ok(false);
    }
    meta.schema_version = SCHEMA_VERSION;
    Ok(true)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct OperationRecord {
    pub id: String,
    pub kind: String,
    pub timestamp: DateTime<Utc>,
    pub index: i64,
    pub data: JsonValue,
    #[serde(default)]
    pub inverse: Option<JsonValue>,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewProjectSpec {
    pub title: String,
    #[serde(default)]
    pub composer: String,
    pub tempo_bpm: f64,
    pub time_signature: String,
    pub key_signature: String,
    pub instrumentation: Vec<InstrumentationEntry>,
    /// Initial canonical MusicXML for the empty project.
    pub initial_musicxml: String,
    /// First operation describing how the project came into being.
    pub initial_operation: OperationRecord,
    /// Optional parent folder; defaults to `~/Documents/Stockhausen/`.
    #[serde(default)]
    pub parent_dir: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectHandle {
    pub path: PathBuf,
    pub meta: ProjectMeta,
    pub score_musicxml: String,
    pub operations: Vec<OperationRecord>,
    /// Operations whose intent was journalled but whose materialised state
    /// has not yet been folded into `score.musicxml` (i.e. log entries with
    /// `index > meta.last_op_index`). Surfaced to the UI as a recovery
    /// prompt.
    pub pending_operations: Vec<OperationRecord>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SaveResult {
    pub updated_at: DateTime<Utc>,
    pub last_op_index: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentProject {
    pub path: PathBuf,
    pub title: String,
    pub last_opened: DateTime<Utc>,
}

/* ---------------------- Path helpers ----------------------------------- */

fn document_root() -> Result<PathBuf, String> {
    let docs =
        dirs::document_dir().ok_or_else(|| "could not locate Documents directory".to_string())?;
    Ok(docs.join("Stockhausen"))
}

fn config_root() -> Result<PathBuf, String> {
    let cfg = dirs::config_dir()
        .ok_or_else(|| "could not locate Application Support directory".to_string())?;
    Ok(cfg.join("Stockhausen"))
}

fn recent_path() -> Result<PathBuf, String> {
    Ok(config_root()?.join("recent.json"))
}

/// Tauri command — exposed so the UI can show "default project root: …" hints.
#[tauri::command]
pub fn project_default_root() -> Result<PathBuf, String> {
    document_root()
}

/// Sanitise a free-text title into a filesystem-safe folder name.
///
/// Music analogy: this is the difference between the *piece title* — "Étude
/// in F♯ Minor, Op. 25 No. 7" — and the *catalogue number* on the librarian's
/// shelf: `etude-in-f-sharp-minor-op-25-no-7`. Same piece, different label.
fn slugify(title: &str) -> String {
    let mut out = String::with_capacity(title.len());
    let mut prev_dash = true;
    for ch in title.chars() {
        let allowed = ch.is_ascii_alphanumeric();
        if allowed {
            out.push(ch.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    if out.is_empty() {
        out.push_str("untitled");
    }
    out
}

fn unique_project_dir(root: &Path, slug: &str) -> PathBuf {
    let mut candidate = root.join(slug);
    if !candidate.exists() {
        return candidate;
    }
    for n in 2..1000 {
        candidate = root.join(format!("{slug}-{n}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    // Extremely unlikely fallback.
    root.join(format!("{slug}-{}", Uuid::new_v4().simple()))
}

/* ---------------------- Atomic I/O ------------------------------------- */

/// Write `data` to `path` atomically: write to `<path>.tmp`, fsync, rename.
///
/// Music analogy: this is the same discipline as a copyist transcribing on a
/// new sheet of staff paper and only sliding it into the published part once
/// every line is finished — no smudged half-pages.
fn atomic_write(path: &Path, data: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir {}: {e}", parent.display()))?;
    }
    let tmp = path.with_extension(format!(
        "{}.tmp",
        path.extension().and_then(|s| s.to_str()).unwrap_or("part")
    ));
    {
        let mut file = File::create(&tmp).map_err(|e| format!("create {}: {e}", tmp.display()))?;
        file.write_all(data)
            .map_err(|e| format!("write {}: {e}", tmp.display()))?;
        file.sync_all()
            .map_err(|e| format!("fsync {}: {e}", tmp.display()))?;
    }
    fs::rename(&tmp, path).map_err(|e| format!("rename {}: {e}", path.display()))?;
    Ok(())
}

/// Append a single JSONL record to the journal and fsync. Append-only.
fn append_journal(path: &Path, op: &OperationRecord) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir {}: {e}", parent.display()))?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("open journal {}: {e}", path.display()))?;
    let line = serde_json::to_string(op).map_err(|e| format!("serialise op: {e}"))?;
    file.write_all(line.as_bytes())
        .map_err(|e| format!("append journal: {e}"))?;
    file.write_all(b"\n")
        .map_err(|e| format!("append journal newline: {e}"))?;
    file.sync_all().map_err(|e| format!("fsync journal: {e}"))?;
    Ok(())
}

fn read_journal(path: &Path) -> Result<Vec<OperationRecord>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let file = File::open(path).map_err(|e| format!("open journal {}: {e}", path.display()))?;
    let mut out = Vec::new();
    for (line_no, line) in BufReader::new(file).lines().enumerate() {
        let line = line.map_err(|e| format!("read journal line {line_no}: {e}"))?;
        if line.trim().is_empty() {
            continue;
        }
        let op: OperationRecord = serde_json::from_str(&line)
            .map_err(|e| format!("parse journal line {line_no}: {e}"))?;
        out.push(op);
    }
    Ok(out)
}

/* ---------------------- Recent registry -------------------------------- */

fn read_recent() -> Vec<RecentProject> {
    let Ok(path) = recent_path() else {
        return Vec::new();
    };
    let Ok(text) = fs::read_to_string(&path) else {
        return Vec::new();
    };
    serde_json::from_str::<Vec<RecentProject>>(&text).unwrap_or_default()
}

fn write_recent(items: &[RecentProject]) -> Result<(), String> {
    let path = recent_path()?;
    let bytes = serde_json::to_vec_pretty(items).map_err(|e| format!("serialise recent: {e}"))?;
    atomic_write(&path, &bytes)
}

fn remember_recent(path: &Path, title: &str) {
    let mut items = read_recent();
    items.retain(|r| r.path != path);
    items.insert(
        0,
        RecentProject {
            path: path.to_path_buf(),
            title: title.to_string(),
            last_opened: Utc::now(),
        },
    );
    items.truncate(16);
    if let Err(e) = write_recent(&items) {
        warn!("could not update recent.json: {e}");
    }
}

#[tauri::command]
pub fn project_recent_list() -> Vec<RecentProject> {
    let items = read_recent();
    // Drop entries whose folder no longer exists on disk.
    items
        .into_iter()
        .filter(|r| r.path.join("project.json").exists())
        .collect()
}

#[tauri::command]
pub fn project_recent_forget(path: PathBuf) -> Result<(), String> {
    let mut items = read_recent();
    items.retain(|r| r.path != path);
    write_recent(&items)
}

/* ---------------------- Lifecycle commands ----------------------------- */

#[tauri::command]
pub fn project_new(spec: NewProjectSpec) -> Result<ProjectHandle, String> {
    let parent = spec.parent_dir.clone().unwrap_or(document_root()?);
    fs::create_dir_all(&parent).map_err(|e| format!("mkdir {}: {e}", parent.display()))?;
    let slug = slugify(&spec.title);
    let project_dir = unique_project_dir(&parent, &slug);
    fs::create_dir_all(&project_dir)
        .map_err(|e| format!("mkdir {}: {e}", project_dir.display()))?;
    for sub in ["snapshots", "renders", "takes", "exports"] {
        fs::create_dir_all(project_dir.join(sub))
            .map_err(|e| format!("mkdir {}: {e}", project_dir.join(sub).display()))?;
    }

    let now = Utc::now();
    let mixer_tracks = spec
        .instrumentation
        .iter()
        .map(|i| MixerTrack {
            id: i.id.clone(),
            gain_db: 0.0,
            pan: 0.0,
            mute: false,
            solo: false,
            sends: Vec::new(),
            inserts: Vec::new(),
            group: None,
        })
        .collect();
    let meta = ProjectMeta {
        schema_version: SCHEMA_VERSION,
        id: Uuid::new_v4().to_string(),
        title: spec.title.clone(),
        composer: spec.composer.clone(),
        created_at: now,
        updated_at: now,
        tempo_bpm: spec.tempo_bpm,
        time_signature: spec.time_signature.clone(),
        key_signature: spec.key_signature.clone(),
        instrumentation: spec.instrumentation.clone(),
        mixer: MixerState {
            tracks: mixer_tracks,
            master: MixerMaster {
                gain_db: 0.0,
                inserts: Vec::new(),
            },
            buses: Vec::new(),
        },
        agent_state: AgentState::default(),
        composition_brief: None,
        automation: Vec::new(),
        audio_clips: Vec::new(),
        markers: Vec::new(),
        last_op_index: spec.initial_operation.index,
    };

    write_project_files(
        &project_dir,
        &meta,
        &spec.initial_musicxml,
        Some(&spec.initial_operation),
    )?;

    remember_recent(&project_dir, &meta.title);

    info!("created new project at {}", project_dir.display());

    Ok(ProjectHandle {
        path: project_dir,
        meta,
        score_musicxml: spec.initial_musicxml,
        operations: vec![spec.initial_operation],
        pending_operations: Vec::new(),
    })
}

#[tauri::command]
pub fn project_open(path: PathBuf) -> Result<ProjectHandle, String> {
    let meta_path = path.join("project.json");
    let score_path = path.join("score.musicxml");
    let log_path = path.join("operations.log");

    let meta_bytes =
        fs::read(&meta_path).map_err(|e| format!("read {}: {e}", meta_path.display()))?;
    let mut meta: ProjectMeta =
        serde_json::from_slice(&meta_bytes).map_err(|e| format!("parse project.json: {e}"))?;

    // On-load migration (ADR-0016). A v1 project upgrades to v2 in place; the new
    // DAW fields default to empty via `#[serde(default)]`, so the upgrade is lossless.
    let from_version = meta.schema_version;
    if migrate_meta(&mut meta)? {
        let bytes = serde_json::to_vec_pretty(&meta)
            .map_err(|e| format!("serialise migrated project.json: {e}"))?;
        atomic_write(&meta_path, &bytes)?;
        info!(
            "migrated project {} from schema v{} to v{}",
            path.display(),
            from_version,
            SCHEMA_VERSION
        );
    }

    let score_musicxml = fs::read_to_string(&score_path)
        .map_err(|e| format!("read {}: {e}", score_path.display()))?;
    let operations = read_journal(&log_path)?;

    let pending_operations: Vec<OperationRecord> = operations
        .iter()
        .filter(|op| op.index > meta.last_op_index)
        .cloned()
        .collect();

    remember_recent(&path, &meta.title);

    info!(
        "opened project {} ({} ops, {} pending)",
        path.display(),
        operations.len(),
        pending_operations.len()
    );

    Ok(ProjectHandle {
        path,
        meta,
        score_musicxml,
        operations,
        pending_operations,
    })
}

#[derive(Debug, Clone, Deserialize)]
pub struct SaveRequest {
    pub path: PathBuf,
    pub meta: ProjectMeta,
    pub score_musicxml: String,
    /// New operation to journal alongside this save. Omit when saving an
    /// otherwise-identical state (e.g. on metadata-only edits).
    #[serde(default)]
    pub operation: Option<OperationRecord>,
}

#[tauri::command]
pub fn project_save(req: SaveRequest) -> Result<SaveResult, String> {
    let mut meta = req.meta;
    meta.updated_at = Utc::now();
    if let Some(op) = &req.operation {
        if op.index < meta.last_op_index {
            return Err(format!(
                "operation index {} is older than current last_op_index {}",
                op.index, meta.last_op_index
            ));
        }
        meta.last_op_index = op.index;
    }

    write_project_files(
        &req.path,
        &meta,
        &req.score_musicxml,
        req.operation.as_ref(),
    )?;
    remember_recent(&req.path, &meta.title);
    Ok(SaveResult {
        updated_at: meta.updated_at,
        last_op_index: meta.last_op_index,
    })
}

fn write_project_files(
    project_dir: &Path,
    meta: &ProjectMeta,
    score_musicxml: &str,
    operation: Option<&OperationRecord>,
) -> Result<(), String> {
    if let Some(op) = operation {
        append_journal(&project_dir.join("operations.log"), op)?;
    }
    atomic_write(
        &project_dir.join("score.musicxml"),
        score_musicxml.as_bytes(),
    )?;
    let meta_bytes =
        serde_json::to_vec_pretty(meta).map_err(|e| format!("serialise project.json: {e}"))?;
    atomic_write(&project_dir.join("project.json"), &meta_bytes)?;
    Ok(())
}

#[tauri::command]
pub fn project_close(_app: AppHandle, _path: PathBuf) -> Result<(), String> {
    // Phase 1 has no per-project file locks; reserved for future use.
    Ok(())
}

#[tauri::command]
pub fn project_open_dialog(app: AppHandle) -> Result<Option<PathBuf>, String> {
    use tauri_plugin_dialog::DialogExt;

    let folder = app.dialog().file().blocking_pick_folder();
    Ok(folder.and_then(|p| p.into_path().ok()))
}

/* ---------------------- Tests ----------------------------------------- */

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;
    use tempfile::tempdir;

    fn fake_op(index: i64) -> OperationRecord {
        OperationRecord {
            id: Uuid::new_v4().to_string(),
            kind: "score_replace".to_string(),
            timestamp: Utc::now(),
            index,
            data: json!({ "musicxml": "<score>" }),
            inverse: None,
            description: Some(format!("test op #{index}")),
        }
    }

    fn build_spec(title: &str, parent: &Path) -> NewProjectSpec {
        NewProjectSpec {
            title: title.to_string(),
            composer: "Test".into(),
            tempo_bpm: 120.0,
            time_signature: "4/4".into(),
            key_signature: "C major".into(),
            instrumentation: vec![InstrumentationEntry {
                id: "piano".into(),
                instrument: "piano".into(),
                channel: 0,
                guitar: None,
            }],
            initial_musicxml: "<score-partwise/>".to_string(),
            initial_operation: fake_op(0),
            parent_dir: Some(parent.to_path_buf()),
        }
    }

    #[test]
    fn slugify_handles_unicode_and_punctuation() {
        assert_eq!(
            slugify("Étude in F# minor — Op. 25"),
            "tude-in-f-minor-op-25"
        );
        assert_eq!(slugify("   spaces   "), "spaces");
        assert_eq!(slugify("!!!"), "untitled");
    }

    #[test]
    fn unique_project_dir_disambiguates() {
        let tmp = tempdir().unwrap();
        let a = unique_project_dir(tmp.path(), "song");
        fs::create_dir_all(&a).unwrap();
        let b = unique_project_dir(tmp.path(), "song");
        assert_ne!(a, b);
        assert!(b
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("song-"));
    }

    #[test]
    fn round_trip_new_save_open() {
        let tmp = tempdir().unwrap();
        let spec = build_spec("My Piece", tmp.path());

        let handle = project_new(spec.clone()).expect("project_new should succeed");
        assert!(handle.path.join("project.json").exists());
        assert!(handle.path.join("score.musicxml").exists());
        assert!(handle.path.join("operations.log").exists());
        assert_eq!(handle.meta.last_op_index, 0);
        assert_eq!(handle.operations.len(), 1);

        // Apply 9 more operations and save them through `project_save`.
        let mut meta = handle.meta.clone();
        for i in 1..=9 {
            let op = fake_op(i);
            let req = SaveRequest {
                path: handle.path.clone(),
                meta: meta.clone(),
                score_musicxml: format!("<score n={i}/>"),
                operation: Some(op),
            };
            let result = project_save(req).expect("save");
            meta.last_op_index = result.last_op_index;
        }

        let reopened = project_open(handle.path.clone()).expect("reopen");
        assert_eq!(reopened.meta.last_op_index, 9);
        assert_eq!(reopened.operations.len(), 10);
        assert!(reopened.pending_operations.is_empty());
        assert_eq!(reopened.score_musicxml, "<score n=9/>");
    }

    #[test]
    fn pending_operations_detected_when_journal_outpaces_state() {
        let tmp = tempdir().unwrap();
        let spec = build_spec("Crash Test", tmp.path());
        let handle = project_new(spec).unwrap();

        // Simulate a crash: append two ops to the journal without bumping
        // `last_op_index` in project.json (i.e. the materialised state lags).
        for i in 1..=2 {
            append_journal(&handle.path.join("operations.log"), &fake_op(i)).unwrap();
        }

        let reopened = project_open(handle.path.clone()).unwrap();
        assert_eq!(reopened.meta.last_op_index, 0);
        assert_eq!(reopened.operations.len(), 3);
        assert_eq!(reopened.pending_operations.len(), 2);
        assert_eq!(reopened.pending_operations[0].index, 1);
        assert_eq!(reopened.pending_operations[1].index, 2);
    }

    #[test]
    fn ten_edits_survive_simulated_kill() {
        // Mirrors the M1.0 acceptance test in PHASE_1.md §1.5:
        // 10 edits → simulated `kill -9` (last project.json never reaches the
        // disk) → reopen the project → all 10 edits still readable.
        let tmp = tempdir().unwrap();
        let spec = build_spec("Long Session", tmp.path());
        let handle = project_new(spec).unwrap();

        let mut meta = handle.meta.clone();
        for i in 1..=10 {
            // Half-way through the run we stop persisting project.json to
            // simulate a crash that flushed only the journal. Every operation
            // still gets durably journalled via `append_journal`.
            let op = fake_op(i);
            append_journal(&handle.path.join("operations.log"), &op).unwrap();
            if i <= 5 {
                meta.last_op_index = i;
                let bytes = serde_json::to_vec_pretty(&meta).unwrap();
                atomic_write(&handle.path.join("project.json"), &bytes).unwrap();
                atomic_write(
                    &handle.path.join("score.musicxml"),
                    format!("<score n={i}/>").as_bytes(),
                )
                .unwrap();
            }
        }

        let reopened = project_open(handle.path.clone()).unwrap();
        // The materialised snapshot is the last clean save (i=5),
        assert_eq!(reopened.meta.last_op_index, 5);
        // …but every one of the 10 edits is still present in the journal.
        // (the initial score_init makes it 11 total)
        assert_eq!(reopened.operations.len(), 11);
        // …and 5 of them are flagged as "pending" so the UI can recover.
        assert_eq!(reopened.pending_operations.len(), 5);
        let pending_indices: Vec<i64> = reopened
            .pending_operations
            .iter()
            .map(|o| o.index)
            .collect();
        assert_eq!(pending_indices, vec![6, 7, 8, 9, 10]);
    }

    #[test]
    fn migrates_v1_project_to_current_losslessly_and_byte_stable() {
        let tmp = tempdir().unwrap();
        let dir = tmp.path().join("legacy");
        fs::create_dir_all(&dir).unwrap();

        // A minimal schema-v1 project.json — none of the v2 DAW fields present.
        let v1 = json!({
            "schema_version": 1,
            "id": "legacy-id",
            "title": "Legacy Piece",
            "composer": "Old Hand",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
            "tempo_bpm": 100.0,
            "time_signature": "3/4",
            "key_signature": "G major",
            "instrumentation": [{ "id": "piano", "instrument": "piano", "channel": 0 }],
            "mixer": {
                "tracks": [{ "id": "piano", "gain_db": -3.0, "pan": 0.2, "mute": false, "solo": false }],
                "master": { "gain_db": 0.0 }
            },
            "agent_state": { "last_seen_message_count": 0, "pinned_explanations": [] },
            "composition_brief": null,
            "last_op_index": 0
        });
        atomic_write(
            &dir.join("project.json"),
            &serde_json::to_vec_pretty(&v1).unwrap(),
        )
        .unwrap();
        atomic_write(&dir.join("score.musicxml"), b"<score-partwise/>").unwrap();
        append_journal(&dir.join("operations.log"), &fake_op(0)).unwrap();

        // Open → migrates v1 → current (v3) in one stamp and rewrites project.json.
        let handle = project_open(dir.clone()).expect("open + migrate v1");
        assert_eq!(handle.meta.schema_version, SCHEMA_VERSION);

        // Reserved DAW shapes exist and are empty/defaulted.
        assert!(handle.meta.automation.is_empty());
        assert!(handle.meta.audio_clips.is_empty());
        assert!(handle.meta.markers.is_empty());
        assert!(handle.meta.mixer.buses.is_empty());
        assert!(handle.meta.mixer.master.inserts.is_empty());
        let track = &handle.meta.mixer.tracks[0];
        assert!(track.sends.is_empty());
        assert!(track.inserts.is_empty());
        assert_eq!(track.group, None);

        // Unchanged v1 data is preserved exactly.
        assert_eq!(track.gain_db, -3.0);
        assert_eq!(track.pan, 0.2);
        assert_eq!(handle.meta.title, "Legacy Piece");
        assert_eq!(handle.meta.last_op_index, 0);
        assert_eq!(handle.score_musicxml, "<score-partwise/>");

        // A migrated non-guitar part stays guitar-less (off-disk), so it is byte-stable:
        // a second open does not re-migrate or rewrite project.json.
        assert!(handle.meta.instrumentation[0].guitar.is_none());
        let after_first = fs::read(dir.join("project.json")).unwrap();
        let handle2 = project_open(dir.clone()).expect("reopen migrated project");
        assert_eq!(handle2.meta.schema_version, SCHEMA_VERSION);
        let after_second = fs::read(dir.join("project.json")).unwrap();
        assert_eq!(
            after_first, after_second,
            "second open must not rewrite an already-current project"
        );
    }

    #[test]
    fn migrates_v2_project_to_v3_and_round_trips_guitar_config() {
        let tmp = tempdir().unwrap();
        let dir = tmp.path().join("guitar");
        fs::create_dir_all(&dir).unwrap();

        // A schema-v2 project with a part that already carries a guitar block
        // (e.g. written by a build mid-Phase-4). v2→v3 is additive, so the block
        // must survive open → migrate → save → reopen unchanged.
        let v2 = json!({
            "schema_version": 2,
            "id": "gtr-id",
            "title": "Variación",
            "composer": "Irving",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
            "tempo_bpm": 96.0,
            "time_signature": "3/4",
            "key_signature": "A minor",
            "instrumentation": [{
                "id": "guitar", "instrument": "guitar", "channel": 0,
                "guitar": {
                    "tuning": ["E4","B3","G3","D3","A2","E2"],
                    "capo": 2,
                    "profile": "nylon",
                    "view_mode": "both"
                }
            }],
            "mixer": {
                "tracks": [{ "id": "guitar", "gain_db": 0.0, "pan": 0.0, "mute": false, "solo": false }],
                "master": { "gain_db": 0.0 }
            },
            "agent_state": { "last_seen_message_count": 0, "pinned_explanations": [] },
            "last_op_index": 0
        });
        atomic_write(
            &dir.join("project.json"),
            &serde_json::to_vec_pretty(&v2).unwrap(),
        )
        .unwrap();
        atomic_write(&dir.join("score.musicxml"), b"<score-partwise/>").unwrap();
        append_journal(&dir.join("operations.log"), &fake_op(0)).unwrap();

        let handle = project_open(dir.clone()).expect("open + migrate v2");
        assert_eq!(handle.meta.schema_version, SCHEMA_VERSION);

        let gtr = handle.meta.instrumentation[0]
            .guitar
            .as_ref()
            .expect("guitar block preserved through v2→v3 migration");
        assert_eq!(
            gtr.tuning,
            vec!["E4", "B3", "G3", "D3", "A2", "E2"]
        );
        assert_eq!(gtr.capo, 2);
        assert_eq!(gtr.profile, "nylon");
        assert_eq!(gtr.view_mode, "both");

        // Re-open after the migration rewrite is byte-stable (already current).
        let after_first = fs::read(dir.join("project.json")).unwrap();
        let _ = project_open(dir.clone()).expect("reopen migrated v3");
        let after_second = fs::read(dir.join("project.json")).unwrap();
        assert_eq!(after_first, after_second);
    }

    #[test]
    fn rejects_newer_than_supported_schema() {
        // A project written by a future build (schema ahead of us) must be refused,
        // not silently mangled.
        let tmp = tempdir().unwrap();
        let handle = project_new(build_spec("Future", tmp.path())).unwrap();
        let mut m = handle.meta.clone();
        m.schema_version = SCHEMA_VERSION + 1;
        assert!(migrate_meta(&mut m).is_err());
    }

    #[test]
    fn atomic_write_is_visible_only_on_completion() {
        let tmp = tempdir().unwrap();
        let p = tmp.path().join("nested").join("score.musicxml");
        atomic_write(&p, b"<score-partwise/>").unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), "<score-partwise/>");
        // No straggling .tmp file should remain.
        assert!(!tmp
            .path()
            .join("nested")
            .join("score.musicxml.tmp")
            .exists());
    }
}
