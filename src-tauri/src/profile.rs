//! Body profile persistence for Selena.
//!
//! Stored as JSON in the app data dir. Limits mirror PROFILE_LIMITS in src/bodyParams.ts.
//! Never trust the file or the frontend: every value is clamped, NaN falls back to the default.

use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

const FILE_NAME: &str = "body_profile.json";

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Sex {
    Neutral,
    Male,
    Female,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct BodyProfile {
    pub sex: Sex,
    pub height_cm: f64,
    pub weight_kg: f64,
    pub body_fat_pct: f64,
    pub muscularity: f64,
    pub shoulder_width: f64,
    pub waist: f64,
    pub hips: f64,
}

impl Default for BodyProfile {
    fn default() -> Self {
        BodyProfile {
            sex: Sex::Neutral,
            height_cm: 181.0,
            weight_kg: 78.0,
            body_fat_pct: 18.0,
            muscularity: 0.5,
            shoulder_width: 1.0,
            waist: 1.0,
            hips: 1.0,
        }
    }
}

fn clamp_or(v: f64, lo: f64, hi: f64, fallback: f64) -> f64 {
    if v.is_finite() { v.clamp(lo, hi) } else { fallback }
}

impl BodyProfile {
    fn sanitized(self) -> Self {
        let d = BodyProfile::default();
        BodyProfile {
            sex: self.sex,
            height_cm: clamp_or(self.height_cm, 140.0, 210.0, d.height_cm),
            weight_kg: clamp_or(self.weight_kg, 40.0, 150.0, d.weight_kg),
            body_fat_pct: clamp_or(self.body_fat_pct, 5.0, 50.0, d.body_fat_pct),
            muscularity: clamp_or(self.muscularity, 0.0, 1.0, d.muscularity),
            shoulder_width: clamp_or(self.shoulder_width, 0.85, 1.15, d.shoulder_width),
            waist: clamp_or(self.waist, 0.85, 1.25, d.waist),
            hips: clamp_or(self.hips, 0.85, 1.25, d.hips),
        }
    }
}

fn file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir unavailable: {e}"))?;
    Ok(dir.join(FILE_NAME))
}

/// Atomic write: temp file, then rename, so a crash never leaves a half-written profile.
fn save(app: &AppHandle, p: &BodyProfile) -> Result<(), String> {
    let path = file_path(app)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("cannot create data dir: {e}"))?;
    }
    let json = serde_json::to_string_pretty(p).map_err(|e| format!("serialize failed: {e}"))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| format!("write failed: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("rename failed: {e}"))?;
    Ok(())
}

/// Missing or corrupt file is not an error for the user: start from the neutral mannequin.
#[tauri::command]
pub fn get_body_profile(app: AppHandle) -> Result<BodyProfile, String> {
    let path = file_path(&app)?;
    let profile = fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<BodyProfile>(&s).ok())
        .map(BodyProfile::sanitized)
        .unwrap_or_default();
    Ok(profile)
}

#[tauri::command]
pub fn set_body_profile(app: AppHandle, profile: BodyProfile) -> Result<BodyProfile, String> {
    let clean = profile.sanitized();
    save(&app, &clean)?;
    Ok(clean)
}

#[tauri::command]
pub fn reset_body_profile(app: AppHandle) -> Result<BodyProfile, String> {
    let d = BodyProfile::default();
    save(&app, &d)?;
    Ok(d)
}