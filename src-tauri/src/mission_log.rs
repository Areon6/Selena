//! Persistent daily mission log for Selena (Day 1 .. current mission day).
//!
//! Stored as JSON in the app data dir using atomic write (`.json.tmp` -> rename).
//! Pre-seeded entries across Days 1..75 represent simulated sample history with
//! intentional empty days to demonstrate `NO SIGNAL` and retroactive logging.

use crate::lexicon::{self, Sentiment};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

const FILE_NAME: &str = "mission_log.json";
pub(crate) const CURRENT_MISSION_DAY: u32 = 78;

/// Number of scored metrics: hr, bp_sys, bp_dia, spo2, ppco2, sleep_hours, dose_usv_h, mood, energy, stress.
const SCORED_METRICS: u8 = 10;
/// Below this many filled metrics the day cannot earn a top rank.
const MIN_METRICS: u8 = 4;
/// Score ceiling for sparse days (rank never above B).
const INCOMPLETE_CAP: i32 = 84;
/// Score ceiling when the day level is Watch (rank never above B).
const WATCH_CAP: i32 = 84;
/// Score ceiling when the day level is Critical (rank never above C).
const CRITICAL_CAP: i32 = 69;
/// Raw score below which the day is Critical / Watch regardless of single thresholds.
const SCORE_CRITICAL_BELOW: i32 = 50;
const SCORE_WATCH_BELOW: i32 = 70;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DaySource {
    Sample,
    Checkin,
    Manual,
    Import,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum DayLevel {
    Nominal,
    Watch,
    Critical,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum DayRank {
    A,
    B,
    C,
    D,
}

/// One line of the score breakdown. `key` is a stable ID the frontend localizes;
/// `basis` is "nasa" | "mixed" | "illustrative".
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScoreFactor {
    pub key: String,
    pub actual: String,
    pub target: String,
    pub delta: i32,
    pub severity: DayLevel,
    pub basis: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DayEntry {
    pub day: u32,
    pub source: Option<DaySource>,

    // Physiology (NASA-STD-3001 units: ppCO2 in mmHg, dose in µSv/h)
    pub hr: Option<f64>,
    pub bp_sys: Option<f64>,
    pub bp_dia: Option<f64>,
    pub spo2: Option<f64>,
    pub ppco2: Option<f64>,
    pub sleep_hours: Option<f64>,
    pub dose_usv_h: Option<f64>,

    // Psychology (1..=5 scales + canonical tag IDs + note)
    pub mood: Option<u8>,
    pub energy: Option<u8>,
    pub stress: Option<u8>,
    pub tags: Option<Vec<String>>,
    pub note: Option<String>,
    pub themes: Option<Vec<String>>,
    pub sentiment: Option<Sentiment>,

    // Computed illustrative composite score (all recomputed in enrich())
    pub level: Option<DayLevel>,
    pub rank: Option<DayRank>,
    #[serde(default)]
    pub score: Option<u8>,
    /// How many of the 10 scored fields are actually filled.
    #[serde(default)]
    pub metrics_count: Option<u8>,
    #[serde(default)]
    pub score_factors: Option<Vec<ScoreFactor>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionLog {
    pub current_day: u32,
    pub entries: Vec<DayEntry>,
}

fn clean_opt(v: Option<f64>, lo: f64, hi: f64) -> Option<f64> {
    v.filter(|x| x.is_finite()).map(|x| x.clamp(lo, hi))
}

fn clean_scale(v: Option<u8>) -> Option<u8> {
    v.map(|x| x.clamp(1, 5))
}

pub(crate) fn sanitize_entry(mut e: DayEntry) -> Result<DayEntry, String> {
    if e.day == 0 || e.day > CURRENT_MISSION_DAY {
        return Err(format!("day must be between 1 and {CURRENT_MISSION_DAY}"));
    }
    e.hr = clean_opt(e.hr, 30.0, 220.0);
    e.bp_sys = clean_opt(e.bp_sys, 60.0, 260.0);
    e.bp_dia = clean_opt(e.bp_dia, 35.0, 160.0);
    if let (Some(sys), Some(dia)) = (e.bp_sys, e.bp_dia)
        && sys <= dia {
            return Err("systolic must be higher than diastolic".into());
        }
    e.spo2 = clean_opt(e.spo2, 70.0, 100.0);
    e.ppco2 = clean_opt(e.ppco2, 0.0, 25.0);
    e.sleep_hours = clean_opt(e.sleep_hours, 0.0, 16.0);
    e.dose_usv_h = clean_opt(e.dose_usv_h, 0.0, 50_000.0);

    e.mood = clean_scale(e.mood);
    e.energy = clean_scale(e.energy);
    e.stress = clean_scale(e.stress);

    e.note = e
        .note
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    Ok(enrich(e))
}

/// How many of the 10 scored fields are filled.
fn count_metrics(e: &DayEntry) -> u8 {
    [
        e.hr.is_some(),
        e.bp_sys.is_some(),
        e.bp_dia.is_some(),
        e.spo2.is_some(),
        e.ppco2.is_some(),
        e.sleep_hours.is_some(),
        e.dose_usv_h.is_some(),
        e.mood.is_some(),
        e.energy.is_some(),
        e.stress.is_some(),
    ]
    .iter()
    .filter(|filled| **filled)
    .count() as u8
}

fn factor(
    key: &str,
    actual: String,
    target: &str,
    delta: i32,
    severity: DayLevel,
    basis: &str,
) -> ScoreFactor {
    ScoreFactor {
        key: key.to_string(),
        actual,
        target: target.to_string(),
        delta,
        severity,
        basis: basis.to_string(),
    }
}

/// Illustrative composite rating relative to on-board day target bands (mmHg for ppCO2).
///
/// Returns `(level, rank, score, metrics_count, factors)`.
///
/// Invariants (enforced here, covered by tests):
/// * `score == 100 + sum(delta)` (before clamping to 0..=100), every cap is itself a factor;
/// * Nominal -> A (>= 85) or B; Watch -> B (70..=84) or C (< 70); Critical -> C (50..=69) or D (< 50);
/// * fewer than 4 filled metrics -> score <= 84, rank never A.
///
/// Basis: ppCO2 thresholds are "nasa", sleep is "mixed" (Ames guidance + illustrative critical cut),
/// everything else (and the composite itself) is "illustrative".
pub fn compute_level_rank(e: &DayEntry) -> (DayLevel, DayRank, u8, u8, Vec<ScoreFactor>) {
    use DayLevel::{Critical, Nominal, Watch};

    let metrics = count_metrics(e);
    let mut f: Vec<ScoreFactor> = Vec::new();

    if let Some(p) = e.ppco2 {
        let actual = format!("{p:.1} mmHg");
        if p >= 4.5 {
            f.push(factor("ppco2_crit", actual, "< 3.0 mmHg", -32, Critical, "nasa"));
        } else if p >= 3.0 {
            f.push(factor("ppco2_watch", actual, "< 3.0 mmHg", -15, Watch, "nasa"));
        }
    }
    if let Some(s) = e.spo2 {
        let actual = format!("{s:.1} %");
        if s <= 90.0 {
            f.push(factor("spo2_crit", actual, "> 95 %", -32, Critical, "illustrative"));
        } else if s <= 95.0 {
            f.push(factor("spo2_watch", actual, "> 95 %", -14, Watch, "illustrative"));
        }
    }
    if let Some(hr) = e.hr {
        let actual = format!("{hr:.0} bpm");
        if hr >= 130.0 || hr < 45.0 {
            f.push(factor("hr_crit", actual, "50–99 bpm", -24, Critical, "illustrative"));
        } else if hr >= 100.0 || hr < 50.0 {
            f.push(factor("hr_watch", actual, "50–99 bpm", -10, Watch, "illustrative"));
        }
    }
    if let Some(sys) = e.bp_sys {
        let actual = format!("{sys:.0} mmHg");
        if sys >= 180.0 {
            f.push(factor("bp_sys_crit", actual, "< 140 mmHg", -25, Critical, "illustrative"));
        } else if sys >= 140.0 {
            f.push(factor("bp_sys_watch", actual, "< 140 mmHg", -12, Watch, "illustrative"));
        }
    }
    if let Some(dia) = e.bp_dia {
        let actual = format!("{dia:.0} mmHg");
        if dia >= 120.0 {
            f.push(factor("bp_dia_crit", actual, "< 90 mmHg", -20, Critical, "illustrative"));
        } else if dia >= 90.0 {
            f.push(factor("bp_dia_watch", actual, "< 90 mmHg", -10, Watch, "illustrative"));
        }
    }
    if let Some(sleep) = e.sleep_hours {
        let actual = format!("{sleep:.1} h");
        if sleep <= 5.0 {
            f.push(factor("sleep_crit", actual, ">= 7.0 h", -22, Critical, "mixed"));
        } else if sleep < 7.0 {
            f.push(factor("sleep_watch", actual, ">= 7.0 h", -10, Watch, "mixed"));
        }
    }
    if let Some(dose) = e.dose_usv_h {
        let actual = format!("{dose:.0} µSv/h");
        if dose >= 1000.0 {
            f.push(factor("dose_crit", actual, "< 200 µSv/h", -35, Critical, "illustrative"));
        } else if dose >= 200.0 {
            f.push(factor("dose_watch", actual, "< 200 µSv/h", -16, Watch, "illustrative"));
        }
    }
    if let Some(stress) = e.stress {
        let actual = format!("{stress}/5");
        if stress >= 5 {
            f.push(factor("stress_high", actual, "<= 3/5", -14, Watch, "illustrative"));
        } else if stress >= 4 {
            f.push(factor("stress_elevated", actual, "<= 3/5", -7, Nominal, "illustrative"));
        }
    }
    if let Some(mood) = e.mood {
        let actual = format!("{mood}/5");
        if mood <= 1 {
            f.push(factor("mood_low", actual, ">= 3/5", -14, Watch, "illustrative"));
        } else if mood <= 2 {
            f.push(factor("mood_sub", actual, ">= 3/5", -7, Nominal, "illustrative"));
        }
    }
    if let Some(energy) = e.energy
        && energy <= 1 {
            f.push(factor("energy_low", format!("{energy}/5"), ">= 2/5", -8, Nominal, "illustrative"));
        }

    // Level: worst single-metric severity, or the accumulated raw score if that is worse.
    let floor_level = f.iter().map(|x| x.severity).max().unwrap_or(Nominal);
    let raw: i32 = 100 + f.iter().map(|x| x.delta).sum::<i32>();
    let score_level = if raw < SCORE_CRITICAL_BELOW {
        Critical
    } else if raw < SCORE_WATCH_BELOW {
        Watch
    } else {
        Nominal
    };
    let level = floor_level.max(score_level);

    let mut score = raw;

    // Sparse day: never a top rank on the strength of one or two readings.
    if metrics < MIN_METRICS {
        let cut = (score - INCOMPLETE_CAP).max(0);
        score -= cut;
        f.push(factor(
            "incomplete_data",
            format!("{metrics}/{SCORED_METRICS}"),
            &format!(">= {MIN_METRICS}/{SCORED_METRICS}"),
            -cut,
            Nominal,
            "illustrative",
        ));
    }

    // Level <-> rank consistency: a Watch day cannot score into A, a Critical day not into A or B.
    let (cap, cap_key) = match level {
        Nominal => (100, ""),
        Watch => (WATCH_CAP, "level_cap_watch"),
        Critical => (CRITICAL_CAP, "level_cap_critical"),
    };
    if score > cap {
        f.push(factor(
            cap_key,
            format!("{score}/100"),
            &format!("<= {cap}/100"),
            -(score - cap),
            level,
            "illustrative",
        ));
        score = cap;
    }

    let score = score.clamp(0, 100);
    let rank = match level {
        Nominal => {
            if score >= 85 {
                DayRank::A
            } else {
                DayRank::B
            }
        }
        Watch => {
            if score >= 70 {
                DayRank::B
            } else {
                DayRank::C
            }
        }
        Critical => {
            if score >= 50 {
                DayRank::C
            } else {
                DayRank::D
            }
        }
    };

    (level, rank, score as u8, metrics, f)
}

fn enrich(mut e: DayEntry) -> DayEntry {
    let (level, rank, score, metrics, factors) = compute_level_rank(&e);
    e.level = Some(level);
    e.rank = Some(rank);
    e.score = Some(score);
    e.metrics_count = Some(metrics);
    e.score_factors = Some(factors);

    let has_text = e.note.as_ref().is_some_and(|n| !n.trim().is_empty());
    let has_tags = e.tags.as_ref().is_some_and(|t| !t.is_empty());
    if has_text || has_tags {
        let lex = lexicon::analyze(e.note.as_deref(), e.tags.as_deref().unwrap_or(&[]));
        e.themes = Some(lex.themes);
        e.sentiment = Some(lex.sentiment);
    } else {
        e.themes = Some(Vec::new());
        e.sentiment = None;
    }

    e
}

pub fn generate_sample_history() -> Vec<DayEntry> {
    type Scenario = (
        f64,
        f64,
        f64,
        f64,
        f64,
        f64,
        f64,
        u8,
        u8,
        u8,
        &'static [&'static str],
        &'static str,
    );

    // (hr, sys, dia, spo2, ppco2_mmhg, sleep_h, dose_usv_h, mood, energy, stress, tags, note)
    let scenarios: &[Scenario] = &[
        // Nominal days
        (65.0, 118.0, 76.0, 97.6, 2.3, 7.6, 39.0, 4, 4, 2, &["calm", "focused"], "Productive EVA prep and nominal cabin checks."),
        (68.0, 121.0, 77.0, 97.4, 2.4, 7.2, 40.0, 4, 4, 2, &["focused"], "Reviewed telemetry baseline and comm schedules."),
        (62.0, 115.0, 73.0, 98.0, 2.2, 8.1, 38.0, 5, 5, 1, &["calm", "motivated"], "Deep uninterrupted sleep. Full ARED resistive session completed."),
        (66.0, 119.0, 75.0, 97.7, 2.4, 7.4, 40.0, 4, 4, 2, &["focused"], "Science rack calibration ran smoothly."),
        (64.0, 117.0, 74.0, 97.8, 2.3, 7.8, 39.0, 4, 4, 2, &[], "Quiet transit shift. All environmental readings nominal."),
        (67.0, 120.0, 76.0, 97.5, 2.5, 7.3, 41.0, 5, 4, 1, &["motivated", "calm"], "High crew morale after delayed video message from home."),
        (69.0, 122.0, 78.0, 97.3, 2.6, 7.1, 42.0, 4, 3, 2, &["focused"], "Optic ultrasound check nominal, minor workload spike."),
        // Watch days (ppCO2 3.1..4.1 mmHg, short sleep <7h)
        (84.0, 134.0, 85.0, 96.2, 3.6, 6.1, 41.0, 3, 2, 4, &["fatigue", "brain_fog", "cabin_stuffy"], "Air felt heavy in module B, ppCO2 crept to 3.6 mmHg. Mild headache."),
        (78.0, 129.0, 82.0, 96.6, 2.8, 5.8, 40.0, 2, 2, 4, &["poor_sleep", "fatigue"], "Noisy fan kept me awake. Low focus during morning drills."),
        (86.0, 136.0, 86.0, 96.0, 4.1, 5.6, 42.0, 2, 2, 5, &["cabin_stuffy", "fatigue", "brain_fog"], "Cabin stuffy before filter swap, ppCO2 stayed above 3.0 mmHg."),
        (76.0, 128.0, 81.0, 96.8, 2.7, 6.2, 43.0, 3, 3, 3, &["homesick"], "Missed family dinner back on Earth. Hard to settle down before sleep."),
        (92.0, 139.0, 88.0, 95.9, 3.4, 5.9, 245.0, 2, 2, 4, &["fatigue", "crew_tension"], "Minor solar flare watch and elevated CO2 added tension on shift."),
        // Critical days (CO2 > 4.5 mmHg or SPE > 1000 µSv/h)
        (104.0, 149.0, 95.0, 94.2, 5.1, 4.7, 44.0, 1, 1, 5, &["fatigue", "weakness", "brain_fog", "cabin_stuffy"], "Scrubber fault pushed ppCO2 to 5.1 mmHg. Nausea, heavy fatigue, exercise paused."),
        (98.0, 144.0, 91.0, 96.9, 2.6, 4.9, 1650.0, 2, 2, 5, &["poor_sleep", "fatigue"], "Solar particle storm alert — spent 4 hours in shielded shelter."),
        // Recovery & additional days
        (64.0, 116.0, 74.0, 97.9, 2.2, 8.0, 39.0, 4, 5, 1, &["motivated", "calm"], "Fresh CO2 cartridge online. Air feels crisp and energy bounced back."),
        (66.0, 118.0, 75.0, 97.6, 2.3, 7.5, 40.0, 4, 4, 2, &["focused"], "Routine maintenance finished ahead of schedule."),
        (61.0, 114.0, 72.0, 98.1, 2.2, 8.3, 38.0, 5, 5, 1, &["calm", "motivated"], "Best recovery night of the mission."),
        (70.0, 124.0, 79.0, 97.2, 2.6, 6.6, 41.0, 3, 3, 3, &["homesick", "poor_sleep"], "Thinking a lot about home as Earth shrinks on cameras."),
        (65.0, 120.0, 76.0, 97.5, 2.4, 7.2, 40.0, 4, 4, 2, &["focused"], "Biomedical experiment phase 2 logged cleanly."),
        (72.0, 126.0, 81.0, 97.0, 2.7, 6.4, 41.0, 3, 3, 4, &["crew_tension"], "Friction over schedule overlap, talked it out after dinner."),
        (63.0, 117.0, 74.0, 97.8, 2.3, 7.7, 39.0, 4, 4, 2, &["calm"], "Evening breathing routine helped sleep onset."),
        (67.0, 120.0, 76.0, 97.5, 2.4, 7.3, 40.0, 4, 4, 2, &[], "Standard transit operations."),
        (62.0, 115.0, 73.0, 97.9, 2.2, 7.9, 39.0, 5, 4, 1, &["motivated"], "Hit personal best on ARED squat load."),
        (74.0, 128.0, 82.0, 96.7, 3.1, 6.3, 42.0, 3, 3, 3, &["fatigue", "cabin_stuffy"], "Slight CO2 drift overnight, airflow boosted."),
        (65.0, 119.0, 75.0, 97.6, 2.4, 7.4, 40.0, 4, 4, 2, &["focused"], "Weekly Houston telemetry bundle queued."),
        (60.0, 113.0, 71.0, 98.2, 2.1, 8.4, 38.0, 5, 5, 1, &["calm", "motivated"], "Off-duty rest day. Feeling steady and rested."),
        (66.0, 121.0, 77.0, 97.4, 2.5, 7.1, 41.0, 4, 3, 2, &[], "Quiet watch shift."),
        (65.0, 119.0, 75.0, 97.6, 2.4, 7.3, 40.0, 4, 4, 2, &["focused"], "Prepared checklists for orbital correction burn."),
    ];

    // 35 filled days across Day 1..75; remaining days intentionally empty (NO SIGNAL)
    let filled_days: &[(u32, usize)] = &[
        (1, 0),  (2, 1),  (3, 2),  (4, 3),  (5, 4),
        (7, 5),  (8, 6),  (10, 7), (11, 8), (12, 9),
        (14, 10),(15, 11),(16, 12),(17, 14),(19, 15),
        (20, 16),(22, 17),(24, 18),(26, 19),(28, 20),
        (31, 21),(34, 22),(37, 23),(40, 24),(43, 25),
        (47, 26),(51, 27),(54, 7), (57, 8), (60, 13),
        (63, 14),(66, 9), (69, 20),(72, 24),(75, 26),
    ];

    let mut entries: Vec<DayEntry> = filled_days
        .iter()
        .map(|(day, idx)| {
            let s = scenarios[*idx];
            enrich(DayEntry {
                day: *day,
                source: Some(DaySource::Sample),
                hr: Some(s.0),
                bp_sys: Some(s.1),
                bp_dia: Some(s.2),
                spo2: Some(s.3),
                ppco2: Some(s.4),
                sleep_hours: Some(s.5),
                dose_usv_h: Some(s.6),
                mood: Some(s.7),
                energy: Some(s.8),
                stress: Some(s.9),
                tags: Some(s.10.iter().map(|t| (*t).to_string()).collect()),
                note: Some(s.11.to_string()),
                ..Default::default()
            })
        })
        .collect();

    entries.sort_by_key(|e| e.day);
    entries
}

fn file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir unavailable: {e}"))?;
    Ok(dir.join(FILE_NAME))
}

fn make_fresh_log() -> MissionLog {
    MissionLog {
        current_day: CURRENT_MISSION_DAY,
        entries: generate_sample_history(),
    }
}

pub(crate) fn save_log(app: &AppHandle, log: &MissionLog) -> Result<(), String> {
    let path = file_path(app)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("cannot create data dir: {e}"))?;
    }
    let json = serde_json::to_string_pretty(log).map_err(|e| format!("serialize failed: {e}"))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| format!("write failed: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("rename failed: {e}"))?;
    Ok(())
}

pub fn load_or_init(app: &AppHandle) -> MissionLog {
    let Ok(path) = file_path(app) else {
        return make_fresh_log();
    };
    if path.exists()
        && let Ok(raw) = fs::read_to_string(&path)
            && let Ok(mut log) = serde_json::from_str::<MissionLog>(&raw) {
                log.current_day = CURRENT_MISSION_DAY;
                log.entries = log
                    .entries
                    .into_iter()
                    .filter(|e| e.day >= 1 && e.day <= CURRENT_MISSION_DAY)
                    .map(enrich)
                    .collect();
                log.entries.sort_by_key(|e| e.day);
                return log;
            }
    let fresh = make_fresh_log();
    let _ = save_log(app, &fresh);
    fresh
}

fn upsert_day(app: &AppHandle, entry: DayEntry) -> Result<MissionLog, String> {
    let clean = sanitize_entry(entry)?;
    let mut log = load_or_init(app);
    if let Some(pos) = log.entries.iter().position(|e| e.day == clean.day) {
        log.entries[pos] = clean;
    } else {
        log.entries.push(clean);
        log.entries.sort_by_key(|e| e.day);
    }
    save_log(app, &log)?;
    Ok(log)
}

pub fn sync_day78_sleep(app: &AppHandle, hours: f64, mood: u8) {
    let log = load_or_init(app);
    let mut entry = log
        .entries
        .iter()
        .find(|e| e.day == CURRENT_MISSION_DAY)
        .cloned()
        .unwrap_or_else(|| DayEntry {
            day: CURRENT_MISSION_DAY,
            source: Some(DaySource::Checkin),
            ..Default::default()
        });
    entry.sleep_hours = Some(hours);
    entry.mood = Some(mood);
    if entry.source.is_none() || entry.source == Some(DaySource::Sample) {
        entry.source = Some(DaySource::Checkin);
    }
    let _ = upsert_day(app, entry);
}

pub fn sync_day78_bp(app: &AppHandle, systolic: f64, diastolic: f64, pulse: f64) {
    let log = load_or_init(app);
    let mut entry = log
        .entries
        .iter()
        .find(|e| e.day == CURRENT_MISSION_DAY)
        .cloned()
        .unwrap_or_else(|| DayEntry {
            day: CURRENT_MISSION_DAY,
            source: Some(DaySource::Checkin),
            ..Default::default()
        });
    entry.bp_sys = Some(systolic);
    entry.bp_dia = Some(diastolic);
    entry.hr = Some(pulse);
    if entry.source.is_none() || entry.source == Some(DaySource::Sample) {
        entry.source = Some(DaySource::Checkin);
    }
    let _ = upsert_day(app, entry);
}

#[tauri::command]
pub fn get_mission_log(app: AppHandle) -> Result<MissionLog, String> {
    Ok(load_or_init(&app))
}

#[tauri::command]
pub fn save_day_entry(app: AppHandle, entry: DayEntry) -> Result<MissionLog, String> {
    upsert_day(&app, entry)
}

#[tauri::command]
pub fn reset_mission_log(app: AppHandle) -> Result<MissionLog, String> {
    let fresh = make_fresh_log();
    save_log(&app, &fresh)?;
    Ok(fresh)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// All 10 metrics filled and inside target bands.
    fn nominal() -> DayEntry {
        DayEntry {
            day: 10,
            hr: Some(65.0),
            bp_sys: Some(118.0),
            bp_dia: Some(76.0),
            spo2: Some(97.6),
            ppco2: Some(2.3),
            sleep_hours: Some(7.6),
            dose_usv_h: Some(39.0),
            mood: Some(4),
            energy: Some(4),
            stress: Some(2),
            ..Default::default()
        }
    }

    fn assert_consistent(e: &DayEntry) {
        let level = e.level.unwrap();
        let rank = e.rank.unwrap();
        let score = e.score.unwrap();
        match level {
            DayLevel::Nominal => assert!(matches!(rank, DayRank::A | DayRank::B), "{e:?}"),
            DayLevel::Watch => {
                assert!(matches!(rank, DayRank::B | DayRank::C), "{e:?}");
                assert!(score <= 84, "{e:?}");
            }
            DayLevel::Critical => {
                assert!(matches!(rank, DayRank::C | DayRank::D), "{e:?}");
                assert!(score <= 69, "{e:?}");
            }
        }
        if e.metrics_count.unwrap() < MIN_METRICS {
            assert!(score <= 84, "{e:?}");
            assert_ne!(rank, DayRank::A);
        }
        let sum: i32 = e.score_factors.as_ref().unwrap().iter().map(|f| f.delta).sum();
        if 100 + sum >= 0 {
            assert_eq!(score as i32, 100 + sum, "factors must add up to the score: {e:?}");
        }
    }

    fn has_factor<'a>(e: &'a DayEntry, key: &str) -> Option<&'a ScoreFactor> {
        e.score_factors.as_ref().unwrap().iter().find(|f| f.key == key)
    }

    #[test]
    fn fully_nominal_day_is_a() {
        let e = enrich(nominal());
        assert_eq!(e.level, Some(DayLevel::Nominal));
        assert_eq!(e.rank, Some(DayRank::A));
        assert_eq!(e.score, Some(100));
        assert_eq!(e.metrics_count, Some(10));
        assert!(e.score_factors.as_ref().unwrap().is_empty());
    }

    #[test]
    fn watch_violation_never_gives_rank_a() {
        let mut e = nominal();
        e.sleep_hours = Some(6.2);
        let e = enrich(e);
        assert_eq!(e.level, Some(DayLevel::Watch));
        assert_ne!(e.rank, Some(DayRank::A));
        assert_eq!(e.rank, Some(DayRank::B));
        assert!(e.score.unwrap() <= 84);
        assert!(has_factor(&e, "sleep_watch").is_some());
        // Raw 90 is lifted above the Watch ceiling, so the cap itself is an explicit factor.
        assert_eq!(has_factor(&e, "level_cap_watch").unwrap().delta, -6);
        assert_consistent(&e);
    }

    #[test]
    fn critical_violation_never_gives_a_or_b() {
        let mut co2 = nominal();
        co2.ppco2 = Some(5.1);
        let mut dose = nominal();
        dose.dose_usv_h = Some(1650.0);

        for e in [enrich(co2), enrich(dose)] {
            assert_eq!(e.level, Some(DayLevel::Critical));
            assert!(!matches!(e.rank, Some(DayRank::A | DayRank::B)), "{e:?}");
            assert!(e.score.unwrap() <= 69);
            assert_consistent(&e);
        }
    }

    #[test]
    fn nearly_empty_day_is_not_a() {
        let e = enrich(DayEntry { day: 3, hr: Some(65.0), ..Default::default() });
        assert_eq!(e.metrics_count, Some(1));
        assert_ne!(e.rank, Some(DayRank::A));
        assert!(e.score.unwrap() <= 84);
        let f = has_factor(&e, "incomplete_data").expect("incomplete_data factor");
        assert_eq!(f.actual, "1/10");
        assert_eq!(f.target, ">= 4/10");
        assert_eq!(f.delta, -16);
        assert_consistent(&e);

        // Three clean readings are still too few; four are enough.
        let three = enrich(DayEntry {
            day: 3,
            hr: Some(65.0),
            spo2: Some(97.0),
            ppco2: Some(2.3),
            ..Default::default()
        });
        assert_ne!(three.rank, Some(DayRank::A));
        let four = enrich(DayEntry {
            day: 3,
            hr: Some(65.0),
            spo2: Some(97.0),
            ppco2: Some(2.3),
            mood: Some(4),
            ..Default::default()
        });
        assert_eq!(four.rank, Some(DayRank::A));
        assert!(has_factor(&four, "incomplete_data").is_none());
    }

    #[test]
    fn every_penalty_is_a_factor_with_honest_basis() {
        let mut e = nominal();
        e.ppco2 = Some(3.6);
        e.sleep_hours = Some(6.2);
        e.hr = Some(105.0);
        let e = enrich(e);

        let co2 = has_factor(&e, "ppco2_watch").expect("ppco2 factor");
        assert_eq!(co2.basis, "nasa");
        assert_eq!(co2.actual, "3.6 mmHg");
        assert_eq!(co2.target, "< 3.0 mmHg");
        assert_eq!(co2.delta, -15);
        assert_eq!(co2.severity, DayLevel::Watch);

        assert_eq!(has_factor(&e, "sleep_watch").unwrap().basis, "mixed");
        assert_eq!(has_factor(&e, "hr_watch").unwrap().basis, "illustrative");

        // Penalties + the level cap explain the whole score.
        assert_consistent(&e);

        let mut crit = nominal();
        crit.ppco2 = Some(5.1);
        let crit = enrich(crit);
        assert_eq!(has_factor(&crit, "ppco2_crit").unwrap().basis, "nasa");
    }

    #[test]
    fn level_rank_invariant_holds_on_a_grid() {
        for ppco2 in [2.3, 3.1, 5.1] {
            for sleep in [7.6, 6.2, 4.5] {
                for dose in [40.0, 250.0, 1650.0] {
                    for stress in [2u8, 4, 5] {
                        for mood in [4u8, 2, 1] {
                            let mut e = nominal();
                            e.ppco2 = Some(ppco2);
                            e.sleep_hours = Some(sleep);
                            e.dose_usv_h = Some(dose);
                            e.stress = Some(stress);
                            e.mood = Some(mood);
                            assert_consistent(&enrich(e));
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn sample_history_is_consistent() {
        let entries = generate_sample_history();
        assert_eq!(entries.len(), 35);
        for e in &entries {
            assert_eq!(e.metrics_count, Some(10));
            assert_consistent(e);
        }
    }

    #[test]
    fn old_log_without_new_fields_still_deserializes() {
        let json = r#"{"day":5,"hr":65.0,"level":"nominal","rank":"A"}"#;
        let e: DayEntry = serde_json::from_str(json).unwrap();
        assert!(e.score.is_none() && e.metrics_count.is_none() && e.score_factors.is_none());
        let e = enrich(e);
        assert_eq!(e.metrics_count, Some(1));
        assert_ne!(e.rank, Some(DayRank::A));
    }
}