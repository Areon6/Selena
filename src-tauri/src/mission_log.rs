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
const CURRENT_MISSION_DAY: u32 = 78;

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

    // Computed illustrative composite score
    pub level: Option<DayLevel>,
    pub rank: Option<DayRank>,
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

fn sanitize_entry(mut e: DayEntry) -> Result<DayEntry, String> {
    if e.day == 0 || e.day > CURRENT_MISSION_DAY {
        return Err(format!("day must be between 1 and {CURRENT_MISSION_DAY}"));
    }
    e.hr = clean_opt(e.hr, 30.0, 220.0);
    e.bp_sys = clean_opt(e.bp_sys, 60.0, 260.0);
    e.bp_dia = clean_opt(e.bp_dia, 35.0, 160.0);
    if let (Some(sys), Some(dia)) = (e.bp_sys, e.bp_dia) {
        if sys <= dia {
            return Err("systolic must be higher than diastolic".into());
        }
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

/// Illustrative composite rating aligned with SELENA telemetry thresholds (mmHg for ppCO2).
pub fn compute_level_rank(e: &DayEntry) -> (DayLevel, DayRank) {
    let mut score: i32 = 100;
    let mut floor_level = DayLevel::Nominal;

    if let Some(ppco2) = e.ppco2 {
        if ppco2 >= 4.5 {
            score -= 32;
            floor_level = floor_level.max(DayLevel::Critical);
        } else if ppco2 >= 3.0 {
            score -= 15;
            floor_level = floor_level.max(DayLevel::Watch);
        }
    }
    if let Some(spo2) = e.spo2 {
        if spo2 <= 90.0 {
            score -= 32;
            floor_level = floor_level.max(DayLevel::Critical);
        } else if spo2 <= 95.0 {
            score -= 14;
            floor_level = floor_level.max(DayLevel::Watch);
        }
    }
    if let Some(hr) = e.hr {
        if hr >= 130.0 || hr < 45.0 {
            score -= 24;
            floor_level = floor_level.max(DayLevel::Critical);
        } else if hr >= 100.0 || hr < 50.0 {
            score -= 10;
            floor_level = floor_level.max(DayLevel::Watch);
        }
    }
    if let Some(sys) = e.bp_sys {
        if sys >= 180.0 {
            score -= 25;
            floor_level = floor_level.max(DayLevel::Critical);
        } else if sys >= 140.0 {
            score -= 12;
            floor_level = floor_level.max(DayLevel::Watch);
        }
    }
    if let Some(dia) = e.bp_dia {
        if dia >= 120.0 {
            score -= 20;
            floor_level = floor_level.max(DayLevel::Critical);
        } else if dia >= 90.0 {
            score -= 10;
            floor_level = floor_level.max(DayLevel::Watch);
        }
    }
    if let Some(sleep) = e.sleep_hours {
        if sleep <= 5.0 {
            score -= 22;
            floor_level = floor_level.max(DayLevel::Critical);
        } else if sleep < 7.0 {
            score -= 10;
            floor_level = floor_level.max(DayLevel::Watch);
        }
    }
    if let Some(dose) = e.dose_usv_h {
        if dose >= 1000.0 {
            score -= 35;
            floor_level = floor_level.max(DayLevel::Critical);
        } else if dose >= 200.0 {
            score -= 16;
            floor_level = floor_level.max(DayLevel::Watch);
        }
    }
    if let Some(stress) = e.stress {
        if stress >= 5 {
            score -= 14;
            floor_level = floor_level.max(DayLevel::Watch);
        } else if stress >= 4 {
            score -= 7;
        }
    }
    if let Some(mood) = e.mood {
        if mood <= 1 {
            score -= 14;
            floor_level = floor_level.max(DayLevel::Watch);
        } else if mood <= 2 {
            score -= 7;
        }
    }
    if let Some(energy) = e.energy {
        if energy <= 1 {
            score -= 8;
        }
    }

    let score_level = if score < 55 {
        DayLevel::Critical
    } else if score < 78 {
        DayLevel::Watch
    } else {
        DayLevel::Nominal
    };
    let level = floor_level.max(score_level);

    let mut rank = if score >= 90 {
        DayRank::A
    } else if score >= 75 {
        DayRank::B
    } else if score >= 55 {
        DayRank::C
    } else {
        DayRank::D
    };

    if level == DayLevel::Critical && matches!(rank, DayRank::A | DayRank::B) {
        rank = DayRank::C;
    }

    (level, rank)
}

fn enrich(mut e: DayEntry) -> DayEntry {
    let (level, rank) = compute_level_rank(&e);
    e.level = Some(level);
    e.rank = Some(rank);

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
                themes: None,
                sentiment: None,
                level: None,
                rank: None,
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

fn save_log(app: &AppHandle, log: &MissionLog) -> Result<(), String> {
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
    if path.exists() {
        if let Ok(raw) = fs::read_to_string(&path) {
            if let Ok(mut log) = serde_json::from_str::<MissionLog>(&raw) {
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
        }
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