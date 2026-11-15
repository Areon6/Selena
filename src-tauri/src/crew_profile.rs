//! Persistent crew roster (up to 7 slots) & physiological baseline (`crew_roster.json`).
//!
//! 100% offline, atomic write (`.json.tmp` -> `rename`) in `app_data_dir()`.
//! Capacity matches ISS maximum expedition complement (7 slots; NASA Mars DRA 5.0 baseline is 6).
//!
//! Scientific honesty:
//! - Reference profiles (Frank Rubio, Christina Koch) use public NASA biographical facts
//!   (role, spaceflight record, age). Private medical/anthropometric metrics are NOT published
//!   by NASA and are pre-filled as illustrative defaults.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const ROSTER_FILE_NAME: &str = "crew_roster.json";
const LEGACY_FILE_NAME: &str = "crew_profile.json";
pub const MAX_CREW_SLOTS: usize = 7;

const MAX_ID_CHARS: usize = 40;
const MAX_CALLSIGN_CHARS: usize = 40;
const MAX_FULL_NAME_CHARS: usize = 80;
const MAX_ROLE_CHARS: usize = 48;
const MAX_BIO_CHARS: usize = 320;
const MAX_SOURCE_ID_CHARS: usize = 48;

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct CrewBodyBaseline {
    pub sex: String,
    pub height_cm: f64,
    pub weight_kg: f64,
    pub body_fat_pct: f64,
    pub muscularity: f64,
    pub shoulder_width: f64,
    pub waist: f64,
    pub hips: f64,
}

impl Default for CrewBodyBaseline {
    fn default() -> Self {
        Self {
            sex: "neutral".to_string(),
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct CrewSlot {
    pub id: String,
    pub preset_kind: String, // "nasa-reference" | "custom"
    pub mission_bio: String,
    pub source_id: String,
    pub crew: CrewProfile,
    pub body: CrewBodyBaseline,
}

impl Default for CrewSlot {
    fn default() -> Self {
        Self {
            id: String::new(),
            preset_kind: "custom".to_string(),
            mission_bio: String::new(),
            source_id: "mars-dra5".to_string(),
            crew: CrewProfile::default(),
            body: CrewBodyBaseline::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct CrewRoster {
    pub active_id: String,
    pub max_slots: usize,
    pub slots: Vec<CrewSlot>,
}

impl Default for CrewRoster {
    fn default() -> Self {
        default_roster()
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

pub fn sanitize_body_baseline(mut b: CrewBodyBaseline) -> CrewBodyBaseline {
    let def = CrewBodyBaseline::default();
    let sex_norm = b.sex.trim().to_ascii_lowercase();
    b.sex = match sex_norm.as_str() {
        "male" | "female" | "neutral" => sex_norm,
        _ => def.sex,
    };
    b.height_cm = sanitize_f64(b.height_cm, def.height_cm, 135.0, 215.0);
    b.weight_kg = sanitize_f64(b.weight_kg, def.weight_kg, 40.0, 150.0);
    b.body_fat_pct = sanitize_f64(b.body_fat_pct, def.body_fat_pct, 5.0, 45.0);
    b.muscularity = sanitize_f64(b.muscularity, def.muscularity, 0.0, 1.0);
    b.shoulder_width = sanitize_f64(b.shoulder_width, def.shoulder_width, 0.75, 1.35);
    b.waist = sanitize_f64(b.waist, def.waist, 0.75, 1.35);
    b.hips = sanitize_f64(b.hips, def.hips, 0.75, 1.35);
    b
}

pub fn sanitize_crew_slot(mut s: CrewSlot) -> CrewSlot {
    s.id = trim_max_chars(&s.id, MAX_ID_CHARS);
    s.preset_kind = match s.preset_kind.trim() {
        "nasa-reference" => "nasa-reference".to_string(),
        _ => "custom".to_string(),
    };
    s.mission_bio = trim_max_chars(&s.mission_bio, MAX_BIO_CHARS);
    let src = trim_max_chars(&s.source_id, MAX_SOURCE_ID_CHARS);
    s.source_id = if src.is_empty() {
        "mars-dra5".to_string()
    } else {
        src
    };
    s.crew = sanitize_crew_profile(s.crew);
    s.body = sanitize_body_baseline(s.body);
    s
}

pub fn rubio_reference_slot() -> CrewSlot {
    CrewSlot {
        id: "slot-rubio".to_string(),
        preset_kind: "nasa-reference".to_string(),
        mission_bio: "Col. Francisco \"Frank\" Rubio, M.D. · 371-day U.S. single-spaceflight ISS record (Exp 67/68/69), board-certified flight surgeon, Artemis III. Public NASA bio; clinical vitals & 3D parameters are illustrative defaults.".to_string(),
        source_id: "bio-rubio".to_string(),
        crew: CrewProfile {
            onboarded: false,
            walkthrough_completed: false,
            callsign: "RUBIO-68".to_string(),
            full_name: "Francisco \"Frank\" Rubio".to_string(),
            role: "Crew Medical Officer".to_string(),
            age_years: 50,
            baseline_hr_bpm: 62.0,
            baseline_sys_mmhg: 116.0,
            baseline_dia_mmhg: 74.0,
            default_eva_hours: 0.0,
        },
        body: CrewBodyBaseline {
            sex: "male".to_string(),
            height_cm: 178.0,
            weight_kg: 79.0,
            body_fat_pct: 15.0,
            muscularity: 0.62,
            shoulder_width: 1.04,
            waist: 0.96,
            hips: 0.98,
        },
    }
}

pub fn koch_reference_slot() -> CrewSlot {
    CrewSlot {
        id: "slot-koch".to_string(),
        preset_kind: "nasa-reference".to_string(),
        mission_bio: "Christina Hammock Koch · 328-day woman's single-spaceflight ISS record (Exp 59/60/61), first all-female spacewalk, Artemis II mission specialist. Public NASA bio; clinical vitals & 3D parameters are illustrative defaults.".to_string(),
        source_id: "bio-koch".to_string(),
        crew: CrewProfile {
            onboarded: false,
            walkthrough_completed: false,
            callsign: "KOCH-59".to_string(),
            full_name: "Christina Hammock Koch".to_string(),
            role: "Flight Engineer".to_string(),
            age_years: 47,
            baseline_hr_bpm: 60.0,
            baseline_sys_mmhg: 114.0,
            baseline_dia_mmhg: 72.0,
            default_eva_hours: 0.0,
        },
        body: CrewBodyBaseline {
            sex: "female".to_string(),
            height_cm: 167.0,
            weight_kg: 61.0,
            body_fat_pct: 19.0,
            muscularity: 0.55,
            shoulder_width: 0.94,
            waist: 0.90,
            hips: 1.00,
        },
    }
}

pub fn default_roster() -> CrewRoster {
    CrewRoster {
        active_id: "slot-rubio".to_string(),
        max_slots: MAX_CREW_SLOTS,
        slots: vec![rubio_reference_slot(), koch_reference_slot()],
    }
}

fn sanitize_roster(mut r: CrewRoster) -> CrewRoster {
    r.max_slots = MAX_CREW_SLOTS;
    r.slots = r
        .slots
        .into_iter()
        .map(sanitize_crew_slot)
        .filter(|s| !s.id.is_empty())
        .take(MAX_CREW_SLOTS)
        .collect();
    if r.slots.is_empty() {
        return default_roster();
    }
    if !r.slots.iter().any(|s| s.id == r.active_id) {
        r.active_id = r.slots[0].id.clone();
    }
    r
}

fn active_crew_from_roster(roster: &CrewRoster) -> CrewProfile {
    roster
        .slots
        .iter()
        .find(|s| s.id == roster.active_id)
        .or_else(|| roster.slots.first())
        .map(|s| s.crew.clone())
        .unwrap_or_default()
}

fn op_select_slot(roster: &mut CrewRoster, id: &str) -> Result<(), String> {
    let target = id.trim();
    if !roster.slots.iter().any(|s| s.id == target) {
        return Err(format!("crew slot not found: {target}"));
    }
    roster.active_id = target.to_string();
    Ok(())
}

fn op_save_slot(roster: &mut CrewRoster, raw: CrewSlot) -> Result<String, String> {
    let mut slot = sanitize_crew_slot(raw);
    if slot.id.is_empty() {
        let mut idx = roster.slots.len() + 1;
        loop {
            let candidate = format!("slot-crew-{idx}");
            if !roster.slots.iter().any(|s| s.id == candidate) {
                slot.id = candidate;
                break;
            }
            idx += 1;
        }
    }

    if let Some(pos) = roster.slots.iter().position(|s| s.id == slot.id) {
        roster.slots[pos] = slot.clone();
    } else {
        if roster.slots.len() >= MAX_CREW_SLOTS {
            return Err(format!(
                "Crew roster limit reached ({MAX_CREW_SLOTS} slots max; ISS expedition complement)."
            ));
        }
        roster.slots.push(slot.clone());
    }

    roster.active_id = slot.id.clone();
    Ok(slot.id)
}

fn op_delete_slot(roster: &mut CrewRoster, id: &str) -> Result<(), String> {
    if roster.slots.len() <= 1 {
        return Err("At least 1 crew profile must remain on board.".into());
    }
    let target = id.trim();
    let prev = roster.slots.len();
    roster.slots.retain(|s| s.id != target);
    if roster.slots.len() == prev {
        return Err(format!("crew slot not found: {target}"));
    }
    if roster.active_id == target {
        roster.active_id = roster.slots[0].id.clone();
    }
    Ok(())
}

// ── File persistence ─────────────────────────────────────────────────────────

fn roster_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir unavailable: {e}"))?;
    Ok(dir.join(ROSTER_FILE_NAME))
}

fn legacy_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir unavailable: {e}"))?;
    Ok(dir.join(LEGACY_FILE_NAME))
}

fn write_atomic(path: &PathBuf, json: String) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("cannot create data dir: {e}"))?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| format!("write failed: {e}"))?;
    fs::rename(&tmp, path).map_err(|e| format!("rename failed: {e}"))?;
    Ok(())
}

fn save_roster_to_disk(app: &AppHandle, roster: &CrewRoster) -> Result<(), String> {
    let path = roster_path(app)?;
    let json = serde_json::to_string_pretty(roster).map_err(|e| format!("serialize failed: {e}"))?;
    write_atomic(&path, json)?;

    // Keep legacy crew_profile.json aligned with the active slot.
    let legacy = legacy_path(app)?;
    let active = active_crew_from_roster(roster);
    let legacy_json =
        serde_json::to_string_pretty(&active).map_err(|e| format!("serialize failed: {e}"))?;
    let _ = write_atomic(&legacy, legacy_json);
    Ok(())
}

fn load_or_init_roster(app: &AppHandle) -> Result<CrewRoster, String> {
    let path = roster_path(app)?;
    if path.exists()
        && let Ok(raw) = fs::read_to_string(&path)
        && let Ok(parsed) = serde_json::from_str::<CrewRoster>(&raw)
    {
        return Ok(sanitize_roster(parsed));
    }
    let fresh = default_roster();
    save_roster_to_disk(app, &fresh)?;
    Ok(fresh)
}

pub(crate) fn active_vitals_with_mtime(
    app: &AppHandle,
    cached_mtime: Option<std::time::SystemTime>,
) -> Option<(std::time::SystemTime, (f64, f64, f64))> {
    let path = roster_path(app).ok()?;
    let mtime = fs::metadata(&path).ok()?.modified().ok()?;
    if cached_mtime == Some(mtime) {
        return None;
    }
    let raw = fs::read_to_string(&path).ok()?;
    let parsed = serde_json::from_str::<CrewRoster>(&raw).ok()?;
    let clean = sanitize_roster(parsed);
    let c = active_crew_from_roster(&clean);
    Some((mtime, (c.baseline_hr_bpm, c.baseline_sys_mmhg, c.baseline_dia_mmhg)))
}

// ── Tauri IPC commands ───────────────────────────────────────────────────────

#[tauri::command]
pub fn get_crew_profile(app: AppHandle) -> Result<CrewProfile, String> {
    let roster = load_or_init_roster(&app)?;
    Ok(active_crew_from_roster(&roster))
}

#[tauri::command]
pub fn save_crew_profile(app: AppHandle, profile: CrewProfile) -> Result<CrewProfile, String> {
    let clean = sanitize_crew_profile(profile);
    let mut roster = load_or_init_roster(&app)?;
    if let Some(slot) = roster.slots.iter_mut().find(|s| s.id == roster.active_id) {
        slot.crew = clean.clone();
    } else if let Some(slot) = roster.slots.first_mut() {
        slot.crew = clean.clone();
        roster.active_id = slot.id.clone();
    }
    save_roster_to_disk(&app, &roster)?;
    Ok(clean)
}

#[tauri::command]
pub fn reset_crew_profile(app: AppHandle) -> Result<CrewProfile, String> {
    let fresh = default_roster();
    save_roster_to_disk(&app, &fresh)?;
    Ok(active_crew_from_roster(&fresh))
}

#[tauri::command]
pub fn get_crew_roster(app: AppHandle) -> Result<CrewRoster, String> {
    load_or_init_roster(&app)
}

#[tauri::command]
pub fn select_crew_slot(app: AppHandle, id: String) -> Result<CrewRoster, String> {
    let mut roster = load_or_init_roster(&app)?;
    op_select_slot(&mut roster, &id)?;
    save_roster_to_disk(&app, &roster)?;
    Ok(roster)
}

#[tauri::command]
pub fn save_crew_slot(app: AppHandle, slot: CrewSlot) -> Result<CrewRoster, String> {
    let mut roster = load_or_init_roster(&app)?;
    op_save_slot(&mut roster, slot)?;
    save_roster_to_disk(&app, &roster)?;
    Ok(roster)
}

#[tauri::command]
pub fn delete_crew_slot(app: AppHandle, id: String) -> Result<CrewRoster, String> {
    let mut roster = load_or_init_roster(&app)?;
    op_delete_slot(&mut roster, &id)?;
    save_roster_to_disk(&app, &roster)?;
    Ok(roster)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_roster_contains_two_nasa_reference_astronauts() {
        let roster = default_roster();
        assert_eq!(roster.max_slots, 7);
        assert_eq!(roster.slots.len(), 2);
        assert_eq!(roster.active_id, "slot-rubio");
        assert_eq!(roster.slots[0].crew.callsign, "RUBIO-68");
        assert_eq!(roster.slots[1].crew.callsign, "KOCH-59");
        assert!(!roster.slots[0].crew.onboarded);
    }

    #[test]
    fn enforces_seven_slot_limit_and_allows_select_delete() {
        let mut roster = default_roster();
        for i in 3..=7 {
            let mut slot = CrewSlot::default();
            slot.crew.callsign = format!("CREW-{i}");
            slot.crew.onboarded = true;
            op_save_slot(&mut roster, slot).unwrap();
        }
        assert_eq!(roster.slots.len(), 7);

        let mut overflow = CrewSlot::default();
        overflow.crew.callsign = "CREW-8".into();
        assert!(op_save_slot(&mut roster, overflow).is_err());

        op_select_slot(&mut roster, "slot-koch").unwrap();
        assert_eq!(roster.active_id, "slot-koch");

        op_delete_slot(&mut roster, "slot-koch").unwrap();
        assert_eq!(roster.slots.len(), 6);
        assert_ne!(roster.active_id, "slot-koch");
    }

    #[test]
    fn cannot_delete_last_remaining_slot() {
        let mut roster = default_roster();
        op_delete_slot(&mut roster, "slot-koch").unwrap();
        assert_eq!(roster.slots.len(), 1);
        assert!(op_delete_slot(&mut roster, "slot-rubio").is_err());
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