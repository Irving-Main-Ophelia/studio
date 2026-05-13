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

/// `project.json` schema version. Bumping this requires writing a migrator.
pub const SCHEMA_VERSION: u32 = 1;

/// Mirrors `project.json#instrumentation[*]`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstrumentationEntry {
    pub id: String,
    pub instrument: String,
    #[serde(default)]
    pub channel: u8,
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
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MixerMaster {
    #[serde(default)]
    pub gain_db: f32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MixerState {
    #[serde(default)]
    pub tracks: Vec<MixerTrack>,
    #[serde(default)]
    pub master: MixerMaster,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AgentState {
    #[serde(default)]
    pub last_seen_message_count: u32,
    #[serde(default)]
    pub pinned_explanations: Vec<String>,
}

/// Mirrors the on-disk `project.json` (schema v1).
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
            master: MixerMaster { gain_db: 0.0 },
        },
        agent_state: AgentState::default(),
        composition_brief: None,
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
    let meta: ProjectMeta =
        serde_json::from_slice(&meta_bytes).map_err(|e| format!("parse project.json: {e}"))?;

    if meta.schema_version != SCHEMA_VERSION {
        return Err(format!(
            "Unsupported project schema_version {} (this build expects {SCHEMA_VERSION}). A migration is not yet available.",
            meta.schema_version
        ));
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
