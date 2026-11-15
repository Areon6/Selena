//! Persistent crew onboarding & physiological baseline profile (`crew_profile.json`).
//!
//! 100% offline, atomic write (`.json.tmp` -> `rename`) in `app_data_dir()`.
//! Kept separate from `profile.rs` (`body_profile.json`) so the frontend can
//! save body geometry and crew onboarding data independently.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const FILE_NAME: &str = "crew_profile.json";
const MAX_CALLSIGN_CHARS: usize = 40;
const MAX_FULL_NAME_CHARS: usize = 80;
const MAX_ROLE_CHARS: usize = 48;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct CrewProfile {
    pub onboarded: bool,
    pub walkthrough_completed: bool,
    pub callsign: String,
    pub full_name: String,
    pub role: String,
    pub age_years: u8,
    pub baseline_hr_bpm: f64,
    pub baseline_sys_mmhg: f64,
    pub baseline_dia_mmhg: f64,
    pub default_eva_hours: f64,
}

impl Default for CrewProfile {
    fn default() -> Self {
        Self {
            onboarded: false,
            walkthrough_completed: false,
            callsign: String::new(),
            full_name: String::new(),
            role: "Flight Engineer".to_string(),
            age_years: 36,
            baseline_hr_bpm: 66.0,
            baseline_sys_mmhg: 118.0,
            baseline_dia_mmhg: 76.0,
            default_eva_hours: 0.0,
        }
    }
}

fn trim_max_chars(s: &str, max_chars: usize) -> String {
    s.trim().chars().take(max_chars).collect()
}

fn sanitize_f64(v: f64, default: f64, lo: f64, hi: f64) -> f64 {
    if v.is_finite() {
        v.clamp(lo, hi)
    } else {
        default
    }
}

pub fn sanitize_crew_profile(mut p: CrewProfile) -> CrewProfile {
    let def = CrewProfile::default();

    p.callsign = trim_max_chars(&p.callsign, MAX_CALLSIGN_CHARS);
    p.full_name = trim_max_chars(&p.full_name, MAX_FULL_NAME_CHARS);
    let role_trimmed = trim_max_chars(&p.role, MAX_ROLE_CHARS);
    p.role = if role_trimmed.is_empty() {
        def.role
    } else {
        role_trimmed
    };

    p.age_years = p.age_years.clamp(18, 75);
    p.baseline_hr_bpm = sanitize_f64(p.baseline_hr_bpm, def.baseline_hr_bpm, 35.0, 120.0);
    p.baseline_sys_mmhg = sanitize_f64(p.baseline_sys_mmhg, def.baseline_sys_mmhg, 80.0, 180.0);
    p.baseline_dia_mmhg = sanitize_f64(p.baseline_dia_mmhg, def.baseline_dia_mmhg, 45.0, 110.0);

    // Ensure systolic is strictly higher than diastolic inside safe bounds.
    if p.baseline_sys_mmhg <= p.baseline_dia_mmhg {
        if p.baseline_sys_mmhg >= 65.0 && (p.baseline_sys_mmhg - 10.0) >= 45.0 {
            p.baseline_dia_mmhg = (p.baseline_sys_mmhg - 10.0).clamp(45.0, 110.0);
        } else {
            p.baseline_dia_mmhg = 45.0;
            p.baseline_sys_mmhg = p.baseline_sys_mmhg.max(80.0);
        }
    }

    p.default_eva_hours = sanitize_f64(p.default_eva_hours, def.default_eva_hours, 0.0, 12.0);
    p
}

fn file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir unavailable: {e}"))?;
    Ok(dir.join(FILE_NAME))
}

fn save_to_disk(app: &AppHandle, profile: &CrewProfile) -> Result<(), String> {
    let path = file_path(app)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("cannot create data dir: {e}"))?;
    }
    let json = serde_json::to_string_pretty(profile).map_err(|e| format!("serialize failed: {e}"))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| format!("write failed: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("rename failed: {e}"))?;
    Ok(())
}

fn load_or_init(app: &AppHandle) -> Result<CrewProfile, String> {
    let path = file_path(app)?;
    if path.exists() {
        if let Ok(raw) = fs::read_to_string(&path) {
            if let Ok(parsed) = serde_json::from_str::<CrewProfile>(&raw) {
                return Ok(sanitize_crew_profile(parsed));
            }
        }
    }
    let fresh = CrewProfile::default();
    save_to_disk(app, &fresh)?;
    Ok(fresh)
}

#[tauri::command]
pub fn get_crew_profile(app: AppHandle) -> Result<CrewProfile, String> {
    load_or_init(&app)
}

#[tauri::command]
pub fn save_crew_profile(app: AppHandle, profile: CrewProfile) -> Result<CrewProfile, String> {
    let clean = sanitize_crew_profile(profile);
    save_to_disk(&app, &clean)?;
    Ok(clean)
}

#[tauri::command]
pub fn reset_crew_profile(app: AppHandle) -> Result<CrewProfile, String> {
    let fresh = CrewProfile::default();
    save_to_disk(&app, &fresh)?;
    Ok(fresh)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_values_match_spec() {
        let def = CrewProfile::default();
        assert!(!def.onboarded);
        assert!(!def.walkthrough_completed);
        assert_eq!(def.callsign, "");
        assert_eq!(def.full_name, "");
        assert_eq!(def.role, "Flight Engineer");
        assert_eq!(def.age_years, 36);
        assert_eq!(def.baseline_hr_bpm, 66.0);
        assert_eq!(def.baseline_sys_mmhg, 118.0);
        assert_eq!(def.baseline_dia_mmhg, 76.0);
        assert_eq!(def.default_eva_hours, 0.0);
    }

    #[test]
    fn sanitizes_strings_clamps_bounds_and_fixes_inverted_bp() {
        let long_callsign = format!("  {}  ", "X".repeat(60));
        let long_name = format!("  {}  ", "Y".repeat(100));
        let raw = CrewProfile {
            onboarded: true,
            walkthrough_completed: true,
            callsign: long_callsign,
            full_name: long_name,
            role: "   ".to_string(),
            age_years: 99,
            baseline_hr_bpm: f64::NAN,
            baseline_sys_mmhg: 90.0,
            baseline_dia_mmhg: 105.0,
            default_eva_hours: 25.0,
        };

        let clean = sanitize_crew_profile(raw);
        assert_eq!(clean.callsign.chars().count(), 40);
        assert_eq!(clean.full_name.chars().count(), 80);
        assert_eq!(clean.role, "Flight Engineer");
        assert_eq!(clean.age_years, 75);
        assert_eq!(clean.baseline_hr_bpm, 66.0);
        assert!(clean.baseline_sys_mmhg > clean.baseline_dia_mmhg);
        assert!((45.0..=110.0).contains(&clean.baseline_dia_mmhg));
        assert!((80.0..=180.0).contains(&clean.baseline_sys_mmhg));
        assert_eq!(clean.default_eva_hours, 12.0);
    }

    #[test]
    fn clamps_low_age_and_non_finite_eva() {
        let raw = CrewProfile {
            age_years: 10,
            baseline_hr_bpm: 20.0,
            baseline_sys_mmhg: 80.0,
            baseline_dia_mmhg: 80.0,
            default_eva_hours: f64::INFINITY,
            ..Default::default()
        };
        let clean = sanitize_crew_profile(raw);
        assert_eq!(clean.age_years, 18);
        assert_eq!(clean.baseline_hr_bpm, 35.0);
        assert!(clean.baseline_sys_mmhg > clean.baseline_dia_mmhg);
        assert_eq!(clean.default_eva_hours, 0.0);
    }
}