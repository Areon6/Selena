//! Selena — autonomous on-board health monitor (demo build).
//!
//! ALL NUMBERS ARE SIMULATED. Thresholds are placeholders and must be checked
//! against NASA HRP / NASA-STD-3001 before anyone calls them "medical".

use serde::Serialize;
use std::f64::consts::TAU;
use std::sync::{Mutex, PoisonError};
use std::time::Instant;
use tauri::State;

const MISSION_DAY: u32 = 78;
const COMMS_DELAY_MIN: u32 = 22;
const BASE_DOSE_RATE: f64 = 75.0; // µSv/h, deep-space background (GCR), simulated
const STORM_PEAK: f64 = 3800.0; // µSv/h added at the peak of the demo solar event
const STORM_RAMP_S: f64 = 15.0; // seconds to reach the peak
const BASE_CUMULATIVE_MSV: f64 = 140.0;

// ───────────────────────── types ─────────────────────────

/// Declaration order matters: Nominal < Watch < Critical, so `a.max(b)` works.
#[derive(Serialize, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
enum Level {
    Nominal,
    Watch,
    Critical,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Vitals {
    heart_rate_bpm: f64,
    systolic_mmhg: f64,
    diastolic_mmhg: f64,
    spo2_pct: f64,
    body_temp_c: f64,
    sleep_hours: f64,
    mood_score: u8, // 1..=5
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Environment {
    co2_mmhg: f64,
    dose_rate_usv_h: f64,
    cumulative_dose_msv: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BodyZone {
    id: &'static str,
    name: &'static str,
    level: Level,
    metric: String,
    note: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HazardStatus {
    id: &'static str,
    name: &'static str,
    level: Level,
    value: String,
    detail: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Task {
    id: &'static str,
    title: &'static str,
    detail: &'static str,
    category: &'static str,
    minutes: u32,
    done: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Alert {
    title: &'static str,
    summary: &'static str,
    steps: Vec<&'static str>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthReport {
    mission_day: u32,
    comms_delay_min: u32,
    autonomous: bool,
    level: Level,
    alert: Option<Alert>,
    vitals: Vitals,
    environment: Environment,
    zones: Vec<BodyZone>,
    hazards: Vec<HazardStatus>,
    tasks: Vec<Task>,
}

// ───────────────────────── state ─────────────────────────

struct Inner {
    started: Instant,
    solar_at: Option<Instant>,
    tasks: Vec<Task>,
}

struct AppState(Mutex<Inner>);

impl AppState {
    fn new() -> Self {
        AppState(Mutex::new(Inner {
            started: Instant::now(),
            solar_at: None,
            tasks: default_tasks(),
        }))
    }
}
fn default_tasks() -> Vec<Task> {
    return vec![
        Task {
            id: "ared",
            title: "ARED resistive exercise",
            detail: "Squat, deadlift and heel-raise sets. Loads the skeleton to slow bone loss.",
            category: "Gravity",
            minutes: 45,
            done: false,
        },
        Task {
            id: "optic_scan",
            title: "Optic nerve ultrasound",
            detail: "Self-scan of the optic nerve sheath. Compare against your baseline.",
            category: "SANS",
            minutes: 10,
            done: false,
        },
        Task {
            id: "bp_check",
            title: "Blood pressure and pulse",
            detail: "Seated, at rest, same time every day.",
            category: "Cardio",
            minutes: 5,
            done: false,
        },
        Task {
            id: "sleep_log",
            title: "Sleep and mood log",
            detail: "Hours slept and a 1–5 mood score. Two short nights in a row is a flag.",
            category: "Behavior",
            minutes: 3,
            done: false,
        },
    ]
}

// ───────────────────────── simulation ─────────────────────────

fn wobble(t: f64, period: f64, phase: f64) -> f64 {
    ((t / period + phase) * TAU).sin()
}

fn high_is_bad(v: f64, watch: f64, crit: f64) -> Level {
    if v >= crit {
        Level::Critical
    } else if v >= watch {
        Level::Watch
    } else {
        Level::Nominal
    }
}

fn low_is_bad(v: f64, watch: f64, crit: f64) -> Level {
    if v <= crit {
        Level::Critical
    } else if v <= watch {
        Level::Watch
    } else {
        Level::Nominal
    }
}

fn build_report(inner: &Inner) -> HealthReport {
    let t = inner.started.elapsed().as_secs_f64();
    let storm = inner.solar_at.map(|s| s.elapsed().as_secs_f64());
    let stress = storm.map_or(0.0, |s| (s / STORM_RAMP_S).min(1.0));
    let done = |id: &str| inner.tasks.iter().any(|x| x.id == id && x.done);

    // vitals
    let heart_rate = 68.0 + 3.0 * wobble(t, 17.0, 0.0) + 1.5 * wobble(t, 5.0, 0.3) + 22.0 * stress;
    let systolic = 118.0 + 2.0 * wobble(t, 23.0, 0.2) + 10.0 * stress;
    let diastolic = 76.0 + 1.5 * wobble(t, 29.0, 0.5) + 5.0 * stress;
    let spo2 = 97.5 + 0.4 * wobble(t, 31.0, 0.1);
    let temp = 36.7 + 0.05 * wobble(t, 60.0, 0.4);
    let sleep = 6.4;
    let mood: u8 = 3;

    // environment
    let co2 = 3.1 + 0.25 * wobble(t, 40.0, 0.6);
    let dose_rate = BASE_DOSE_RATE + 4.0 * wobble(t, 11.0, 0.0) + STORM_PEAK * stress;
    let storm_msv = storm.map_or(0.0, |s| {
        let effective = if s < STORM_RAMP_S {
            s * s / (2.0 * STORM_RAMP_S)
        } else {
            s - STORM_RAMP_S / 2.0
        };
        STORM_PEAK * effective / 3600.0 / 1000.0
    });
    let cumulative = BASE_CUMULATIVE_MSV + BASE_DOSE_RATE * t / 3600.0 / 1000.0 + storm_msv;

    // levels (placeholder thresholds)
    let radiation_lv = high_is_bad(dose_rate, 200.0, 1000.0);
    let heart_lv = high_is_bad(heart_rate, 100.0, 130.0).max(high_is_bad(systolic, 140.0, 180.0));
    let lungs_lv = low_is_bad(spo2, 95.0, 90.0).max(high_is_bad(co2, 3.5, 5.3));
    let brain_lv = low_is_bad(sleep, 6.5, 5.0).max(low_is_bad(mood as f64, 2.0, 1.0));
    let eyes_lv = if done("optic_scan") { Level::Nominal } else { Level::Watch };
    let bones_lv = if done("ared") { Level::Nominal } else { Level::Watch };

    let zones = vec![
        BodyZone {
            id: "brain",
            name: "Brain · Sleep",
            level: brain_lv,
            metric: format!("Sleep {:.1} h · Mood {}/5", sleep, mood),
            note: "Short sleep under isolation erodes judgment. Keep a fixed sleep window.".into(),
        },
        BodyZone {
            id: "eyes",
            name: "Eyes · SANS",
            level: eyes_lv,
            metric: if done("optic_scan") { "Optic scan logged" } else { "Optic scan overdue" }.into(),
            note: "Headward fluid shift can swell the optic disc. The baseline scan is your reference.".into(),
        },
        BodyZone {
            id: "heart",
            name: "Cardiovascular",
            level: heart_lv,
            metric: format!("HR {:.0} · BP {:.0}/{:.0}", heart_rate, systolic, diastolic),
            note: if stress > 0.0 {
                "Pulse and pressure rising under stress. Expected during a shelter event."
            } else {
                "Resting values inside the planned range."
            }
            .into(),
        },
        BodyZone {
            id: "lungs",
            name: "Lungs · Air",
            level: lungs_lv,
            metric: format!("SpO₂ {:.1}% · CO₂ {:.1}", spo2, co2),
            note: "Cabin CO₂ builds up before any alarm. Headache or drowsiness is the early sign.".into(),
        },
        BodyZone {
            id: "bones",
            name: "Bone & Muscle",
            level: bones_lv,
            metric: if done("ared") { "ARED logged" } else { "ARED pending" }.into(),
            note: "Unloaded bone loses mineral. Resistive exercise is the main countermeasure.".into(),
        },
        BodyZone {
            id: "radiation",
            name: "Radiation",
            level: radiation_lv,
            metric: format!("{:.0} µSv/h", dose_rate),
            note: match radiation_lv {
                Level::Nominal => "Deep-space background (galactic cosmic rays).",
                Level::Watch => "Elevated against background. Keep watching the trend.",
                Level::Critical => "Solar particle event in progress. Go to shelter now.",
            }
            .into(),
        },
    ];

    let gravity_done = done("ared") as u8 + done("optic_scan") as u8;
    let isolation_lv = brain_lv;
    let environment_lv = high_is_bad(co2, 3.5, 5.3);
    let gravity_lv = if gravity_done == 2 { Level::Nominal } else { Level::Watch };

    let hazards = vec![
        HazardStatus {
            id: "radiation",
            name: "Space Radiation",
            level: radiation_lv,
            value: format!("{:.0} µSv/h", dose_rate),
            detail: format!("Cumulative {:.3} mSv (simulated)", cumulative),
        },
        HazardStatus {
            id: "isolation",
            name: "Isolation & Confinement",
            level: isolation_lv,
            value: format!("Sleep {:.1} h", sleep),
            detail: format!("Mood {}/5", mood),
        },
        HazardStatus {
            id: "distance",
            name: "Distance from Earth",
            level: Level::Nominal,
            value: format!("{} min one-way", COMMS_DELAY_MIN),
            detail: "Decision support runs on board".into(),
        },
        HazardStatus {
            id: "gravity",
            name: "Altered Gravity",
            level: gravity_lv,
            value: format!("{}/2 protocols", gravity_done),
            detail: "Bone loading and optic scan".into(),
        },
        HazardStatus {
            id: "environment",
            name: "Hostile Closed Environment",
            level: environment_lv,
            value: format!("ppCO₂ {:.1} mmHg", co2),
            detail: "Placeholder limits: watch 3.5, critical 5.3".into(),
        },
    ];

    let overall = hazards.iter().map(|h| h.level).max().unwrap_or(Level::Nominal);

    let alert = if radiation_lv == Level::Critical {
        Some(Alert {
            title: "Solar particle event",
            summary: "Dose rate is far above background. Shelter protocol is active.",
            steps: vec![
                "Move every crew member to the storm shelter, the most shielded volume.",
                "Stop EVA and non-essential work. Secure loose equipment.",
                "Keep personal dosimeters on and log the readings.",
                "Stay until the dose rate falls below the release threshold.",
                "Queue a report for Houston. It arrives after the delay, so continue without waiting.",
            ],
        })
    } else {
        None
    };

    HealthReport {
        mission_day: MISSION_DAY,
        comms_delay_min: COMMS_DELAY_MIN,
        autonomous: true,
        level: overall,
        alert,
        vitals: Vitals {
            heart_rate_bpm: heart_rate,
            systolic_mmhg: systolic,
            diastolic_mmhg: diastolic,
            spo2_pct: spo2,
            body_temp_c: temp,
            sleep_hours: sleep,
            mood_score: mood,
        },
        environment: Environment {
            co2_mmhg: co2,
            dose_rate_usv_h: dose_rate,
            cumulative_dose_msv: cumulative,
        },
        zones,
        hazards,
        tasks: inner.tasks.clone(),
    }
}

// ───────────────────────── IPC commands ─────────────────────────
// A poisoned mutex means another thread panicked while holding it. For a
// monitor we prefer to keep serving data, so we recover the inner value.

#[tauri::command]
fn get_health_report(state: State<'_, AppState>) -> HealthReport {
    let inner = state.0.lock().unwrap_or_else(PoisonError::into_inner);
    build_report(&inner)
}

#[tauri::command]
fn toggle_task(id: String, state: State<'_, AppState>) -> Result<HealthReport, String> {
    let mut inner = state.0.lock().unwrap_or_else(PoisonError::into_inner);
    let task = inner
        .tasks
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or_else(|| format!("unknown task: {id}"))?;
    task.done = !task.done;
    Ok(build_report(&inner))
}

#[tauri::command]
fn trigger_solar_event(state: State<'_, AppState>) -> HealthReport {
    let mut inner = state.0.lock().unwrap_or_else(PoisonError::into_inner);
    if inner.solar_at.is_none() {
        inner.solar_at = Some(Instant::now());
    }
    build_report(&inner)
}

#[tauri::command]
fn reset_scenario(state: State<'_, AppState>) -> HealthReport {
    let mut inner = state.0.lock().unwrap_or_else(PoisonError::into_inner);
    inner.solar_at = None;
    inner.tasks = default_tasks();
    build_report(&inner)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            get_health_report,
            toggle_task,
            trigger_solar_event,
            reset_scenario
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}