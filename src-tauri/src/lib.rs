//! Selena — autonomous on-board health monitor (demo build).
//!
//! Telemetry is simulated. Radiation career limit (600 mSv) and habitable ppCO2
//! limit (3.0 mmHg) follow NASA-STD-3001; remaining thresholds are tagged `illustrative`
//! or `mixed` in each BodyZone / HazardStatus.
//!
//! Sleep, mood and blood pressure are NOT simulated: they come from the crew Check-in
//! (log_sleep / log_bp), which also sync into the persistent Day 78 mission log.
//!
//! Two demo incidents can run independently: a solar particle event and a CO2 scrubber failure.

use serde::Serialize;
use std::f64::consts::TAU;
use std::sync::{Mutex, PoisonError};
use std::time::Instant;
use tauri::{AppHandle, State};

mod analytics;
mod crew_profile;
mod importer;
mod lexicon;
mod mission_log;
mod profile;
mod workout_log;

const MISSION_DAY: u32 = 78;
const COMMS_DELAY_MIN: u32 = 22;
const BASE_DOSE_RATE: f64 = 40.0; // µSv/h, simulated inside OCHMO's <1.3 mSv/day GCR bound
const STORM_PEAK: f64 = 3800.0; // µSv/h added at the peak of the demo solar event
const STORM_RAMP_S: f64 = 15.0; // seconds to reach the peak
const BASE_CUMULATIVE_MSV: f64 = 140.0;

// NASA-STD-3001 Vol 2 [V2 6004]
const CO2_LIMIT_MMHG: f64 = 3.0;
// OCHMO-TB-004: symptoms reported above 4.5 mmHg
const CO2_SYMPTOM_MMHG: f64 = 4.5;
// NASA-STD-3001 Vol 1 [V1 4030]
const CAREER_LIMIT_MSV: f64 = 600.0;
// Illustrative, not a NASA figure
const CAREER_WATCH_MSV: f64 = 300.0;

// Demo scrubber failure: ppCO2 climbs along this curve (seconds since failure, mmHg).
// It crosses 3.0 at ~5.5 s and 4.5 at ~14.5 s, then holds at the plateau. Timing is a demo choice.
const CO2_BASE: f64 = 2.4;
const CO2_CURVE: [(f64, f64); 4] = [(0.0, 2.4), (5.5, 3.0), (14.5, 4.5), (18.0, 5.2)];
const CO2_PLATEAU: f64 = 5.2;
/// After "Restore scrubber" the excess CO2 decays linearly to zero over this time.
const CO2_RESTORE_S: f64 = 8.0;

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
    /// None until the crew logs a night in Check-in
    sleep_hours: Option<f64>,
    /// 1..=5, None until logged
    mood_score: Option<u8>,
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
    sources: Vec<&'static str>,
    basis: &'static str, // "nasa" | "mixed" | "illustrative"
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HazardStatus {
    id: &'static str,
    name: &'static str,
    level: Level,
    value: String,
    detail: String,
    sources: Vec<&'static str>,
    basis: &'static str, // "nasa" | "mixed" | "illustrative"
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
    /// "solar" | "co2"
    id: &'static str,
    title: &'static str,
    summary: &'static str,
    steps: Vec<&'static str>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SleepLog {
    hours: f64,
    mood: u8,
    ago_s: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BpLog {
    systolic: f64,
    diastolic: f64,
    pulse: f64,
    ago_s: u64,
}

/// Which demo incidents are running, so each button knows its own state.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Scenarios {
    solar_active: bool,
    co2_failure_active: bool,
    co2_restoring: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthReport {
    mission_day: u32,
    comms_delay_min: u32,
    autonomous: bool,
    level: Level,
    alerts: Vec<Alert>,
    scenarios: Scenarios,
    vitals: Vitals,
    environment: Environment,
    zones: Vec<BodyZone>,
    hazards: Vec<HazardStatus>,
    tasks: Vec<Task>,
    last_sleep: Option<SleepLog>,
    last_bp: Option<BpLog>,
}

// ───────────────────────── state ─────────────────────────

struct SleepEntry {
    hours: f64,
    mood: u8,
    at: Instant,
}

struct BpEntry {
    systolic: f64,
    diastolic: f64,
    pulse: f64,
    at: Instant,
}

struct Inner {
    started: Instant,
    solar_at: Option<Instant>,
    /// Set while the scrubber is failed.
    co2_fail_at: Option<Instant>,
    /// (restore time, excess ppCO2 at that moment) while the scrubber recovers.
    co2_restore: Option<(Instant, f64)>,
    tasks: Vec<Task>,
    sleep: Option<SleepEntry>,
    bp: Option<BpEntry>,
}

struct AppState(Mutex<Inner>);

impl AppState {
    fn new() -> Self {
        AppState(Mutex::new(Inner {
            started: Instant::now(),
            solar_at: None,
            co2_fail_at: None,
            co2_restore: None,
            tasks: default_tasks(),
            sleep: None,
            bp: None,
        }))
    }
}

fn default_tasks() -> Vec<Task> {
    vec![
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
        // `done` of the next two is derived from Check-in entries in build_report()
        Task {
            id: "bp_check",
            title: "Blood pressure and pulse",
            detail: "Seated, at rest. Log it in Tablet → Check-in.",
            category: "Cardio",
            minutes: 5,
            done: false,
        },
        Task {
            id: "sleep_log",
            title: "Sleep and mood log",
            detail: "Hours slept and a 1–5 mood score. Log it in Tablet → Check-in.",
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

/// Excess ppCO2 (above CO2_BASE) `s` seconds after the scrubber failed.
fn co2_failure_extra(s: f64) -> f64 {
    for w in CO2_CURVE.windows(2) {
        let (t0, v0) = w[0];
        let (t1, v1) = w[1];
        if s <= t1 {
            let k = ((s - t0) / (t1 - t0)).clamp(0.0, 1.0);
            return v0 + (v1 - v0) * k - CO2_BASE;
        }
    }
    CO2_PLATEAU - CO2_BASE
}

fn build_report(inner: &Inner) -> HealthReport {
    let t = inner.started.elapsed().as_secs_f64();
    let storm = inner.solar_at.map(|s| s.elapsed().as_secs_f64());
    let stress = storm.map_or(0.0, |s| (s / STORM_RAMP_S).min(1.0));

    // Checklist: two tasks are done iff Check-in has an entry, the rest are toggled by hand.
    let mut tasks = inner.tasks.clone();
    for task in tasks.iter_mut() {
        match task.id {
            "sleep_log" => task.done = inner.sleep.is_some(),
            "bp_check" => task.done = inner.bp.is_some(),
            _ => {}
        }
    }
    let done = |id: &str| tasks.iter().any(|x| x.id == id && x.done);

    // telemetry (simulated)
    let heart_rate = 68.0 + 3.0 * wobble(t, 17.0, 0.0) + 1.5 * wobble(t, 5.0, 0.3) + 22.0 * stress;
    let systolic = 118.0 + 2.0 * wobble(t, 23.0, 0.2) + 10.0 * stress;
    let diastolic = 76.0 + 1.5 * wobble(t, 29.0, 0.5) + 5.0 * stress;
    let spo2 = 97.5 + 0.4 * wobble(t, 31.0, 0.1);
    let temp = 36.7 + 0.05 * wobble(t, 60.0, 0.4);

    // crew-entered
    let sleep_h = inner.sleep.as_ref().map(|s| s.hours);
    let mood = inner.sleep.as_ref().map(|s| s.mood);

    // CO2: baseline wobble + scrubber failure / recovery excess
    let scrubber_failed = inner.co2_fail_at.is_some();
    let co2_extra = if let Some(f) = inner.co2_fail_at {
        co2_failure_extra(f.elapsed().as_secs_f64())
    } else if let Some((at, from)) = inner.co2_restore {
        from * (1.0 - at.elapsed().as_secs_f64() / CO2_RESTORE_S).max(0.0)
    } else {
        0.0
    };
    let scrubber_restoring = !scrubber_failed && co2_extra > 0.0;
    // The wobble fades as the plateau is reached, so the plateau reads ~5.1–5.3 mmHg.
    let prog = (co2_extra / (CO2_PLATEAU - CO2_BASE)).clamp(0.0, 1.0);
    let co2 = CO2_BASE + 0.25 * wobble(t, 40.0, 0.6) * (1.0 - 0.6 * prog) + co2_extra;

    // radiation
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

    // levels
    let radiation_lv = high_is_bad(dose_rate, 200.0, 1000.0) // illustrative
        .max(high_is_bad(cumulative, CAREER_WATCH_MSV, CAREER_LIMIT_MSV));

    let telemetry_lv = high_is_bad(heart_rate, 100.0, 130.0).max(high_is_bad(systolic, 140.0, 180.0));
    // No manual measurement yet = overdue = Watch. Thresholds are illustrative.
    let manual_bp_lv = match &inner.bp {
        None => Level::Watch,
        Some(b) => high_is_bad(b.systolic, 140.0, 180.0)
            .max(high_is_bad(b.diastolic, 90.0, 120.0))
            .max(high_is_bad(b.pulse, 100.0, 130.0)),
    };
    let heart_lv = telemetry_lv.max(manual_bp_lv);

    let environment_lv = high_is_bad(co2, CO2_LIMIT_MMHG, CO2_SYMPTOM_MMHG);
    let lungs_lv = low_is_bad(spo2, 95.0, 90.0) // SpO2: illustrative
        .max(environment_lv);

    // No sleep log yet = overdue = Watch. 7.0 h: NASA Ames poster cites a >= 7 h consensus. 5.0 h and mood are illustrative.
    let brain_lv = match (sleep_h, mood) {
        (Some(h), Some(m)) => low_is_bad(h, 7.0, 5.0).max(low_is_bad(m as f64, 2.0, 1.0)),
        _ => Level::Watch,
    };
    let eyes_lv = if done("optic_scan") { Level::Nominal } else { Level::Watch };
    let bones_lv = if done("ared") { Level::Nominal } else { Level::Watch };

    let brain_metric = match (sleep_h, mood) {
        (Some(h), Some(m)) => format!("Sleep {:.1} h · Mood {}/5", h, m),
        _ => "Sleep not logged".to_string(),
    };
    let heart_metric = match &inner.bp {
        Some(b) => format!(
            "HR {:.0} · BP {:.0}/{:.0} · logged {:.0}/{:.0}",
            heart_rate, systolic, diastolic, b.systolic, b.diastolic
        ),
        None => format!(
            "HR {:.0} · BP {:.0}/{:.0} · BP not logged",
            heart_rate, systolic, diastolic
        ),
    };
    let lungs_note = match environment_lv {
        Level::Nominal => "Cabin CO₂ builds up before any alarm. Headache or drowsiness is the early sign.",
        Level::Watch => "ppCO₂ is above the 3.0 mmHg habitable-volume limit. Headache and drowsiness are the early signs.",
        Level::Critical => "Above 4.5 mmHg crews report fatigue, nausea and poor sleep. Restore CO₂ removal and cut exertion.",
    };

    let zones = vec![
        BodyZone {
            id: "brain",
            name: "Brain · Sleep",
            level: brain_lv,
            metric: brain_metric,
            note: "Short sleep under isolation erodes judgment. Keep a fixed sleep window.".into(),
            sources: vec!["risk-sleep", "risk-behavior", "ames-sleep"],
            basis: "mixed",
        },
        BodyZone {
            id: "eyes",
            name: "Eyes · SANS",
            level: eyes_lv,
            metric: if done("optic_scan") { "Optic scan logged" } else { "Optic scan overdue" }.into(),
            note: "Headward fluid shift can swell the optic disc. The baseline scan is your reference.".into(),
            sources: vec!["risk-sans"],
            basis: "illustrative",
        },
        BodyZone {
            id: "heart",
            name: "Cardiovascular",
            level: heart_lv,
            metric: heart_metric,
            note: if stress > 0.0 {
                "Pulse and pressure rising under stress. Expected during a shelter event."
            } else {
                "Resting values inside the planned range."
            }
            .into(),
            sources: vec!["risk-cardio"],
            basis: "illustrative",
        },
        BodyZone {
            id: "lungs",
            name: "Lungs · Air",
            level: lungs_lv,
            metric: format!("SpO₂ {:.1}% · CO₂ {:.1}", spo2, co2),
            note: lungs_note.into(),
            sources: vec!["haz-environment", "risk-hypoxia", "std-co2", "tb-co2"],
            basis: "mixed",
        },
        BodyZone {
            id: "bones",
            name: "Bone & Muscle",
            level: bones_lv,
            metric: if done("ared") { "ARED logged" } else { "ARED pending" }.into(),
            note: "Unloaded bone loses mineral. Resistive exercise is the main countermeasure.".into(),
            sources: vec!["risk-bone", "risk-fitness"],
            basis: "illustrative",
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
            sources: vec!["risk-cancer", "tb-radiation"],
            basis: "mixed",
        },
    ];

    let gravity_done = done("ared") as u8 + done("optic_scan") as u8;
    let isolation_lv = brain_lv;
    let gravity_lv = if gravity_done == 2 { Level::Nominal } else { Level::Watch };

    let environment_detail = if scrubber_failed {
        "CO₂ scrubber offline. Limit 3.0 mmHg, NASA-STD-3001 V2 6004"
    } else if scrubber_restoring {
        "Scrubber restored, CO₂ falling. Limit 3.0 mmHg, NASA-STD-3001 V2 6004"
    } else {
        "Limit 3.0 mmHg, NASA-STD-3001 V2 6004"
    };

    let hazards = vec![
        HazardStatus {
            id: "radiation",
            name: "Space Radiation",
            level: radiation_lv,
            value: format!("{:.0} µSv/h", dose_rate),
            detail: format!("Cumulative {:.3} mSv (simulated)", cumulative),
            sources: vec!["haz-radiation", "tb-radiation"],
            basis: "mixed",
        },
        HazardStatus {
            id: "isolation",
            name: "Isolation and Confinement",
            level: isolation_lv,
            value: sleep_h.map_or("Sleep —".to_string(), |h| format!("Sleep {:.1} h", h)),
            detail: mood.map_or("Mood —".to_string(), |m| format!("Mood {}/5", m)),
            sources: vec!["haz-isolation", "risk-sleep", "ames-sleep"],
            basis: "mixed",
        },
        HazardStatus {
            id: "distance",
            name: "Distance from Earth",
            level: Level::Nominal,
            value: format!("{} min one-way", COMMS_DELAY_MIN),
            detail: "Decision support runs on board".into(),
            sources: vec!["haz-distance"],
            basis: "illustrative",
        },
        HazardStatus {
            id: "gravity",
            name: "Gravity Fields",
            level: gravity_lv,
            value: format!("{}/2 protocols", gravity_done),
            detail: "Bone loading and optic scan".into(),
            sources: vec!["haz-gravity", "risk-bone", "risk-sans"],
            basis: "illustrative",
        },
        HazardStatus {
            id: "environment",
            name: "Hostile/Closed Environments",
            level: environment_lv,
            value: format!("ppCO₂ {:.1} mmHg", co2),
            detail: environment_detail.into(),
            sources: vec!["haz-environment", "std-co2", "tb-co2"],
            basis: "nasa",
        },
    ];

    let overall = hazards.iter().map(|h| h.level).max().unwrap_or(Level::Nominal);

    let mut alerts: Vec<Alert> = Vec::new();
    if radiation_lv == Level::Critical {
        alerts.push(Alert {
            id: "solar",
            title: "Solar particle event",
            summary: "Dose rate is far above background. Shelter protocol is active.",
            steps: vec![
                "Move every crew member to the storm shelter, the most shielded volume.",
                "Stop EVA and non-essential work. Secure loose equipment.",
                "Keep personal dosimeters on and log the readings.",
                "Stay until the dose rate falls below the release threshold.",
                "Queue a report for Houston. It arrives after the delay, so continue without waiting.",
            ],
        });
    }
    if environment_lv == Level::Critical {
        alerts.push(Alert {
            id: "co2",
            title: "CO₂ scrubber failure",
            summary: "ppCO₂ is above 4.5 mmHg, where NASA reports fatigue, nausea and poor sleep. Demo protocol below.",
            steps: vec![
                "Confirm the reading on a second ppCO₂ sensor.",
                "Switch the cabin to backup CO₂ removal.",
                "Pause exercise and non-essential work. Exercise raises CO₂ output.",
                "Raise ventilation, especially near sleep stations where air stands still.",
                "Log ppCO₂ and crew symptoms until it holds below 3.0 mmHg. Queue a report for Houston.",
            ],
        });
    }

    let last_sleep = inner.sleep.as_ref().map(|s| SleepLog {
        hours: s.hours,
        mood: s.mood,
        ago_s: s.at.elapsed().as_secs(),
    });
    let last_bp = inner.bp.as_ref().map(|b| BpLog {
        systolic: b.systolic,
        diastolic: b.diastolic,
        pulse: b.pulse,
        ago_s: b.at.elapsed().as_secs(),
    });

    HealthReport {
        mission_day: MISSION_DAY,
        comms_delay_min: COMMS_DELAY_MIN,
        autonomous: true,
        level: overall,
        alerts,
        scenarios: Scenarios {
            solar_active: inner.solar_at.is_some(),
            co2_failure_active: scrubber_failed,
            co2_restoring: scrubber_restoring,
        },
        vitals: Vitals {
            heart_rate_bpm: heart_rate,
            systolic_mmhg: systolic,
            diastolic_mmhg: diastolic,
            spo2_pct: spo2,
            body_temp_c: temp,
            sleep_hours: sleep_h,
            mood_score: mood,
        },
        environment: Environment {
            co2_mmhg: co2,
            dose_rate_usv_h: dose_rate,
            cumulative_dose_msv: cumulative,
        },
        zones,
        hazards,
        tasks,
        last_sleep,
        last_bp,
    }
}

// ───────────────────────── IPC commands ─────────────────────────

#[tauri::command]
fn get_health_report(state: State<'_, AppState>) -> HealthReport {
    let inner = state.0.lock().unwrap_or_else(PoisonError::into_inner);
    build_report(&inner)
}

#[tauri::command]
fn toggle_task(id: String, state: State<'_, AppState>) -> Result<HealthReport, String> {
    if id == "sleep_log" || id == "bp_check" {
        return Err("This task is completed by logging it in Tablet → Check-in".into());
    }
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
fn log_sleep(
    hours: f64,
    mood: u8,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<HealthReport, String> {
    if !hours.is_finite() || !(0.0..=16.0).contains(&hours) {
        return Err("sleep hours must be between 0 and 16".into());
    }
    if !(1..=5).contains(&mood) {
        return Err("mood must be 1 to 5".into());
    }
    let report = {
        let mut inner = state.0.lock().unwrap_or_else(PoisonError::into_inner);
        inner.sleep = Some(SleepEntry { hours, mood, at: Instant::now() });
        build_report(&inner)
    };
    mission_log::sync_day78_sleep(&app, hours, mood);
    Ok(report)
}

#[tauri::command]
fn log_bp(
    systolic: f64,
    diastolic: f64,
    pulse: f64,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<HealthReport, String> {
    let ok = |v: f64, lo: f64, hi: f64| v.is_finite() && v >= lo && v <= hi;
    if !ok(systolic, 70.0, 260.0) || !ok(diastolic, 40.0, 160.0) || !ok(pulse, 30.0, 220.0) {
        return Err("blood pressure or pulse is outside the accepted range".into());
    }
    if systolic <= diastolic {
        return Err("systolic must be higher than diastolic".into());
    }
    let report = {
        let mut inner = state.0.lock().unwrap_or_else(PoisonError::into_inner);
        inner.bp = Some(BpEntry { systolic, diastolic, pulse, at: Instant::now() });
        build_report(&inner)
    };
    mission_log::sync_day78_bp(&app, systolic, diastolic, pulse);
    Ok(report)
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
fn trigger_co2_failure(state: State<'_, AppState>) -> HealthReport {
    let mut inner = state.0.lock().unwrap_or_else(PoisonError::into_inner);
    if inner.co2_fail_at.is_none() {
        inner.co2_fail_at = Some(Instant::now());
        inner.co2_restore = None;
    }
    build_report(&inner)
}

/// Fixes the scrubber. CO2 decays back to normal; Check-in entries and the solar event are untouched.
#[tauri::command]
fn restore_co2_scrubber(state: State<'_, AppState>) -> HealthReport {
    let mut inner = state.0.lock().unwrap_or_else(PoisonError::into_inner);
    if let Some(f) = inner.co2_fail_at.take() {
        let extra = co2_failure_extra(f.elapsed().as_secs_f64());
        inner.co2_restore = Some((Instant::now(), extra));
    }
    build_report(&inner)
}

#[tauri::command]
fn reset_scenario(state: State<'_, AppState>) -> HealthReport {
    let mut inner = state.0.lock().unwrap_or_else(PoisonError::into_inner);
    inner.solar_at = None;
    inner.co2_fail_at = None;
    inner.co2_restore = None;
    inner.tasks = default_tasks();
    inner.sleep = None;
    inner.bp = None;
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
            log_sleep,
            log_bp,
            trigger_solar_event,
            trigger_co2_failure,
            restore_co2_scrubber,
            reset_scenario,
            profile::get_body_profile,
            profile::set_body_profile,
            profile::reset_body_profile,
            mission_log::get_mission_log,
            mission_log::save_day_entry,
            mission_log::reset_mission_log,
            analytics::get_mind_analytics,
            importer::import_device_log,
            importer::export_houston_report,
            crew_profile::get_crew_profile,
            crew_profile::save_crew_profile,
            crew_profile::reset_crew_profile,
            crew_profile::get_crew_roster,
            crew_profile::select_crew_slot,
            crew_profile::save_crew_slot,
            crew_profile::delete_crew_slot,
            workout_log::get_exercise_catalog,
            workout_log::get_workout_day,
            workout_log::seed_default_workout_day,
            workout_log::add_workout_entry,
            workout_log::toggle_workout_entry,
            workout_log::delete_workout_entry,
            workout_log::add_nutrition_entry,
            workout_log::delete_nutrition_entry,
            workout_log::set_day_eva_hours
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}