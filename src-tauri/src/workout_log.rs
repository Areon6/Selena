//! Persistent workout & nutrition diary (`workout_log.json`).
//!
//! 100% offline, atomic write (`.json.tmp` -> `rename`) in `app_data_dir()`.
//!
//! Scientific honesty:
//! - Energy target follows NASA-STD-3001 Vol 2 [V2 7003 / V2 7004]:
//!   3035 kcal/day + 200 kcal per EVA hour (`kcalBasis: "nasa"`).
//! - Exercise presets and workout sessions are tagged `workoutBasis: "illustrative"`
//!   (no fabricated NASA calorie-burn formulas).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const FILE_NAME: &str = "workout_log.json";
const MAX_MISSION_DAY: u32 = 78;
const BASE_KCAL_PER_DAY: f64 = 3035.0; // NASA-STD-3001 Vol 2 [V2 7003]
const EVA_KCAL_PER_HOUR: f64 = 200.0; // NASA-STD-3001 Vol 2 [V2 7004]

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExercisePreset {
    pub id: &'static str,
    pub name: &'static str,
    pub category: &'static str, // "ared" | "cardio" | "mobility"
    pub default_minutes: u32,
    pub default_sets: Option<u32>,
    pub default_reps: Option<u32>,
    pub target_system: &'static str,
    pub basis: &'static str,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct WorkoutEntry {
    pub id: String,
    pub day: u32,
    pub preset_id: String,
    pub name: String,
    pub category: String,
    pub minutes: u32,
    pub sets: Option<u32>,
    pub reps: Option<u32>,
    pub load_kg: Option<f64>,
    pub done: bool,
    pub note: Option<String>,
}

impl Default for WorkoutEntry {
    fn default() -> Self {
        Self {
            id: String::new(),
            day: 1,
            preset_id: String::new(),
            name: String::new(),
            category: "ared".to_string(),
            minutes: 15,
            sets: None,
            reps: None,
            load_kg: None,
            done: false,
            note: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct NutritionEntry {
    pub id: String,
    pub day: u32,
    pub meal_type: String, // "breakfast" | "lunch" | "dinner" | "snack" | "hydration"
    pub label: String,
    pub kcal: u32,
    pub protein_g: Option<f64>,
    pub water_ml: Option<u32>,
}

impl Default for NutritionEntry {
    fn default() -> Self {
        Self {
            id: String::new(),
            day: 1,
            meal_type: "snack".to_string(),
            label: String::new(),
            kcal: 0,
            protein_g: None,
            water_ml: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkoutDaySummary {
    pub day: u32,
    pub total_exercise_min: u32,
    pub completed_sessions: usize,
    pub total_sessions: usize,
    pub total_kcal: u32,
    pub target_kcal: u32,
    pub eva_hours: f64,
    pub total_water_ml: u32,
    pub kcal_basis: &'static str,
    pub workout_basis: &'static str,
    pub workouts: Vec<WorkoutEntry>,
    pub meals: Vec<NutritionEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct DayBucket {
    eva_hours: f64,
    workouts: Vec<WorkoutEntry>,
    meals: Vec<NutritionEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct WorkoutLogStore {
    next_seq: u64,
    days: HashMap<u32, DayBucket>,
}

pub fn exercise_catalog() -> Vec<ExercisePreset> {
    vec![
        ExercisePreset {
            id: "ared_squat",
            name: "ARED Back Squat",
            category: "ared",
            default_minutes: 15,
            default_sets: Some(4),
            default_reps: Some(8),
            target_system: "Lower-body bone & hip/femoral loading",
            basis: "illustrative",
        },
        ExercisePreset {
            id: "ared_deadlift",
            name: "ARED Deadlift",
            category: "ared",
            default_minutes: 15,
            default_sets: Some(4),
            default_reps: Some(8),
            target_system: "Posterior chain, lumbar spine & pelvis",
            basis: "illustrative",
        },
        ExercisePreset {
            id: "ared_heel_raise",
            name: "ARED Heel Raises",
            category: "ared",
            default_minutes: 10,
            default_sets: Some(3),
            default_reps: Some(15),
            target_system: "Soleus, gastrocnemius & calcaneal bone",
            basis: "illustrative",
        },
        ExercisePreset {
            id: "ared_press_row",
            name: "ARED Chest Press & Row",
            category: "ared",
            default_minutes: 15,
            default_sets: Some(3),
            default_reps: Some(10),
            target_system: "Upper-body & scapular strength",
            basis: "illustrative",
        },
        ExercisePreset {
            id: "t2_treadmill",
            name: "T2 Treadmill Intervals",
            category: "cardio",
            default_minutes: 30,
            default_sets: Some(5),
            default_reps: None,
            target_system: "Cardiorespiratory endurance & tibial impact",
            basis: "illustrative",
        },
        ExercisePreset {
            id: "cevis_cycle",
            name: "CEVIS Cycle Ergometer",
            category: "cardio",
            default_minutes: 25,
            default_sets: None,
            default_reps: None,
            target_system: "Aerobic capacity & VO2 maintenance",
            basis: "illustrative",
        },
        ExercisePreset {
            id: "core_lumbar_decomp",
            name: "Core & Lumbar Decompression",
            category: "mobility",
            default_minutes: 12,
            default_sets: Some(3),
            default_reps: Some(12),
            target_system: "Spinal elongation comfort & trunk stability",
            basis: "illustrative",
        },
        ExercisePreset {
            id: "cervical_fluid_mobility",
            name: "Cervical & Fluid Shift Mobility",
            category: "mobility",
            default_minutes: 10,
            default_sets: Some(2),
            default_reps: Some(10),
            target_system: "Neck mobility & headward fluid adaptation",
            basis: "illustrative",
        },
    ]
}

fn validate_day(day: u32) -> Result<u32, String> {
    if (1..=MAX_MISSION_DAY).contains(&day) {
        Ok(day)
    } else {
        Err(format!("day must be between 1 and {MAX_MISSION_DAY}"))
    }
}

fn validate_eva_hours(eva_hours: f64) -> Result<f64, String> {
    if eva_hours.is_finite() && (0.0..=12.0).contains(&eva_hours) {
        Ok((eva_hours * 100.0).round() / 100.0)
    } else {
        Err("evaHours must be between 0.0 and 12.0".into())
    }
}

fn validate_minutes(minutes: u32) -> Result<u32, String> {
    if (1..=240).contains(&minutes) {
        Ok(minutes)
    } else {
        Err("minutes must be between 1 and 240".into())
    }
}

fn validate_kcal(kcal: u32) -> Result<u32, String> {
    if kcal <= 5000 {
        Ok(kcal)
    } else {
        Err("kcal must be between 0 and 5000".into())
    }
}

fn validate_water_ml(water_ml: Option<u32>) -> Result<Option<u32>, String> {
    match water_ml {
        None => Ok(None),
        Some(w) if w <= 4000 => Ok(Some(w)),
        Some(_) => Err("waterMl must be between 0 and 4000".into()),
    }
}

fn validate_category(cat: &str) -> Result<String, String> {
    let norm = cat.trim().to_ascii_lowercase();
    match norm.as_str() {
        "ared" | "cardio" | "mobility" => Ok(norm),
        _ => Err("category must be `ared`, `cardio`, or `mobility`".into()),
    }
}

fn validate_meal_type(meal_type: &str) -> Result<String, String> {
    let norm = meal_type.trim().to_ascii_lowercase();
    match norm.as_str() {
        "breakfast" | "lunch" | "dinner" | "snack" | "hydration" => Ok(norm),
        _ => Err("mealType must be breakfast, lunch, dinner, snack, or hydration".into()),
    }
}

pub fn compute_target_kcal(eva_hours: f64) -> u32 {
    let safe = if eva_hours.is_finite() {
        eva_hours.clamp(0.0, 12.0)
    } else {
        0.0
    };
    (BASE_KCAL_PER_DAY + EVA_KCAL_PER_HOUR * safe).round() as u32
}

fn next_id(store: &mut WorkoutLogStore, prefix: &str, day: u32) -> String {
    store.next_seq = store.next_seq.saturating_add(1);
    format!("{prefix}-d{day:02}-{}", store.next_seq)
}

fn build_summary(day: u32, bucket: Option<&DayBucket>) -> WorkoutDaySummary {
    let empty = DayBucket::default();
    let b = bucket.unwrap_or(&empty);

    let total_exercise_min: u32 = b.workouts.iter().map(|w| w.minutes).sum();
    let completed_sessions = b.workouts.iter().filter(|w| w.done).count();
    let total_sessions = b.workouts.len();
    let total_kcal: u32 = b.meals.iter().map(|m| m.kcal).sum();
    let total_water_ml: u32 = b.meals.iter().filter_map(|m| m.water_ml).sum();
    let eva_hours = if b.eva_hours.is_finite() {
        b.eva_hours.clamp(0.0, 12.0)
    } else {
        0.0
    };

    WorkoutDaySummary {
        day,
        total_exercise_min,
        completed_sessions,
        total_sessions,
        total_kcal,
        target_kcal: compute_target_kcal(eva_hours),
        eva_hours,
        total_water_ml,
        kcal_basis: "nasa",
        workout_basis: "illustrative",
        workouts: b.workouts.clone(),
        meals: b.meals.clone(),
    }
}

// ── Pure store operations (used by both IPC commands and unit tests) ─────────

fn op_seed_default_day(store: &mut WorkoutLogStore, day: u32) -> Result<WorkoutDaySummary, String> {
    let day = validate_day(day)?;
    let bucket_empty = store.days.get(&day).is_none_or(|b| b.workouts.is_empty());

    if bucket_empty {
        let catalog = exercise_catalog();
        // Representative daily mix: ARED + Cardio + Mobility
        let default_ids = ["ared_squat", "ared_heel_raise", "t2_treadmill", "core_lumbar_decomp"];
        let mut seeded = Vec::new();
        for pid in default_ids {
            if let Some(preset) = catalog.iter().find(|p| p.id == pid) {
                let id = next_id(store, "w", day);
                seeded.push(WorkoutEntry {
                    id,
                    day,
                    preset_id: preset.id.to_string(),
                    name: preset.name.to_string(),
                    category: preset.category.to_string(),
                    minutes: preset.default_minutes,
                    sets: preset.default_sets,
                    reps: preset.default_reps,
                    load_kg: None,
                    done: false,
                    note: None,
                });
            }
        }
        let bucket = store.days.entry(day).or_default();
        bucket.workouts.extend(seeded);
    }

    Ok(build_summary(day, store.days.get(&day)))
}

#[allow(clippy::too_many_arguments)]
fn op_add_workout(
    store: &mut WorkoutLogStore,
    day: u32,
    preset_id: String,
    name: String,
    category: String,
    minutes: u32,
    sets: Option<u32>,
    reps: Option<u32>,
    load_kg: Option<f64>,
    note: Option<String>,
) -> Result<WorkoutDaySummary, String> {
    let day = validate_day(day)?;
    let minutes = validate_minutes(minutes)?;
    let category = validate_category(&category)?;
    let clean_name: String = name.trim().chars().take(80).collect();
    if clean_name.is_empty() {
        return Err("workout name must not be empty".into());
    }
    let clean_preset: String = preset_id.trim().chars().take(48).collect();
    let clean_load = match load_kg {
        None => None,
        Some(kg) if kg.is_finite() && (0.0..=500.0).contains(&kg) => Some(kg),
        Some(_) => return Err("loadKg must be between 0 and 500".into()),
    };
    let clean_sets = sets.map(|s| s.clamp(1, 30));
    let clean_reps = reps.map(|r| r.clamp(1, 200));
    let clean_note = note
        .map(|n| n.trim().chars().take(240).collect::<String>())
        .filter(|n| !n.is_empty());

    let id = next_id(store, "w", day);
    let entry = WorkoutEntry {
        id,
        day,
        preset_id: if clean_preset.is_empty() {
            "custom".to_string()
        } else {
            clean_preset
        },
        name: clean_name,
        category,
        minutes,
        sets: clean_sets,
        reps: clean_reps,
        load_kg: clean_load,
        done: false,
        note: clean_note,
    };

    store.days.entry(day).or_default().workouts.push(entry);
    Ok(build_summary(day, store.days.get(&day)))
}

fn op_toggle_workout(
    store: &mut WorkoutLogStore,
    day: u32,
    entry_id: &str,
) -> Result<WorkoutDaySummary, String> {
    let day = validate_day(day)?;
    let bucket = store
        .days
        .get_mut(&day)
        .ok_or_else(|| format!("no workout entries for day {day}"))?;
    let item = bucket
        .workouts
        .iter_mut()
        .find(|w| w.id == entry_id)
        .ok_or_else(|| format!("workout entry not found: {entry_id}"))?;
    item.done = !item.done;
    Ok(build_summary(day, store.days.get(&day)))
}

fn op_delete_workout(
    store: &mut WorkoutLogStore,
    day: u32,
    entry_id: &str,
) -> Result<WorkoutDaySummary, String> {
    let day = validate_day(day)?;
    let bucket = store
        .days
        .get_mut(&day)
        .ok_or_else(|| format!("no workout entries for day {day}"))?;
    let prev_len = bucket.workouts.len();
    bucket.workouts.retain(|w| w.id != entry_id);
    if bucket.workouts.len() == prev_len {
        return Err(format!("workout entry not found: {entry_id}"));
    }
    Ok(build_summary(day, store.days.get(&day)))
}

fn op_add_nutrition(
    store: &mut WorkoutLogStore,
    day: u32,
    meal_type: String,
    label: String,
    kcal: u32,
    protein_g: Option<f64>,
    water_ml: Option<u32>,
) -> Result<WorkoutDaySummary, String> {
    let day = validate_day(day)?;
    let meal_type = validate_meal_type(&meal_type)?;
    let kcal = validate_kcal(kcal)?;
    let water_ml = validate_water_ml(water_ml)?;
    let clean_label: String = label.trim().chars().take(80).collect();
    if clean_label.is_empty() {
        return Err("meal label must not be empty".into());
    }
    let clean_protein = match protein_g {
        None => None,
        Some(p) if p.is_finite() && (0.0..=300.0).contains(&p) => Some(p),
        Some(_) => return Err("proteinG must be between 0 and 300".into()),
    };

    let id = next_id(store, "m", day);
    let entry = NutritionEntry {
        id,
        day,
        meal_type,
        label: clean_label,
        kcal,
        protein_g: clean_protein,
        water_ml,
    };

    store.days.entry(day).or_default().meals.push(entry);
    Ok(build_summary(day, store.days.get(&day)))
}

fn op_delete_nutrition(
    store: &mut WorkoutLogStore,
    day: u32,
    entry_id: &str,
) -> Result<WorkoutDaySummary, String> {
    let day = validate_day(day)?;
    let bucket = store
        .days
        .get_mut(&day)
        .ok_or_else(|| format!("no nutrition entries for day {day}"))?;
    let prev_len = bucket.meals.len();
    bucket.meals.retain(|m| m.id != entry_id);
    if bucket.meals.len() == prev_len {
        return Err(format!("nutrition entry not found: {entry_id}"));
    }
    Ok(build_summary(day, store.days.get(&day)))
}

fn op_set_eva_hours(
    store: &mut WorkoutLogStore,
    day: u32,
    eva_hours: f64,
) -> Result<WorkoutDaySummary, String> {
    let day = validate_day(day)?;
    let eva_hours = validate_eva_hours(eva_hours)?;
    store.days.entry(day).or_default().eva_hours = eva_hours;
    Ok(build_summary(day, store.days.get(&day)))
}

// ── File persistence ─────────────────────────────────────────────────────────

fn file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir unavailable: {e}"))?;
    Ok(dir.join(FILE_NAME))
}

fn load_store_from_path(path: &Path) -> WorkoutLogStore {
    if path.exists()
        && let Ok(raw) = fs::read_to_string(path)
        && let Ok(store) = serde_json::from_str::<WorkoutLogStore>(&raw)
    {
        return store;
    }
    WorkoutLogStore::default()
}

fn load_store(app: &AppHandle) -> WorkoutLogStore {
    let Ok(path) = file_path(app) else {
        return WorkoutLogStore::default();
    };
    load_store_from_path(&path)
}

fn save_store_to_path(path: &Path, store: &WorkoutLogStore) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("cannot create data dir: {e}"))?;
    }
    let json = serde_json::to_string_pretty(store).map_err(|e| format!("serialize failed: {e}"))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| format!("write failed: {e}"))?;
    fs::rename(&tmp, path).map_err(|e| format!("rename failed: {e}"))?;
    Ok(())
}

fn save_store(app: &AppHandle, store: &WorkoutLogStore) -> Result<(), String> {
    let path = file_path(app)?;
    save_store_to_path(&path, store)
}

// ── Tauri IPC commands ───────────────────────────────────────────────────────

#[tauri::command]
pub fn get_exercise_catalog() -> Vec<ExercisePreset> {
    exercise_catalog()
}

#[tauri::command]
pub fn get_workout_day(app: AppHandle, day: u32) -> Result<WorkoutDaySummary, String> {
    let day = validate_day(day)?;
    let store = load_store(&app);
    Ok(build_summary(day, store.days.get(&day)))
}

#[tauri::command]
pub fn seed_default_workout_day(app: AppHandle, day: u32) -> Result<WorkoutDaySummary, String> {
    let mut store = load_store(&app);
    let summary = op_seed_default_day(&mut store, day)?;
    save_store(&app, &store)?;
    Ok(summary)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn add_workout_entry(
    app: AppHandle,
    day: u32,
    preset_id: String,
    name: String,
    category: String,
    minutes: u32,
    sets: Option<u32>,
    reps: Option<u32>,
    load_kg: Option<f64>,
    note: Option<String>,
) -> Result<WorkoutDaySummary, String> {
    let mut store = load_store(&app);
    let summary = op_add_workout(
        &mut store, day, preset_id, name, category, minutes, sets, reps, load_kg, note,
    )?;
    save_store(&app, &store)?;
    Ok(summary)
}

#[tauri::command]
pub fn toggle_workout_entry(
    app: AppHandle,
    day: u32,
    entry_id: String,
) -> Result<WorkoutDaySummary, String> {
    let mut store = load_store(&app);
    let summary = op_toggle_workout(&mut store, day, &entry_id)?;
    save_store(&app, &store)?;
    Ok(summary)
}

#[tauri::command]
pub fn delete_workout_entry(
    app: AppHandle,
    day: u32,
    entry_id: String,
) -> Result<WorkoutDaySummary, String> {
    let mut store = load_store(&app);
    let summary = op_delete_workout(&mut store, day, &entry_id)?;
    save_store(&app, &store)?;
    Ok(summary)
}

#[tauri::command]
pub fn add_nutrition_entry(
    app: AppHandle,
    day: u32,
    meal_type: String,
    label: String,
    kcal: u32,
    protein_g: Option<f64>,
    water_ml: Option<u32>,
) -> Result<WorkoutDaySummary, String> {
    let mut store = load_store(&app);
    let summary =
        op_add_nutrition(&mut store, day, meal_type, label, kcal, protein_g, water_ml)?;
    save_store(&app, &store)?;
    Ok(summary)
}

#[tauri::command]
pub fn delete_nutrition_entry(
    app: AppHandle,
    day: u32,
    entry_id: String,
) -> Result<WorkoutDaySummary, String> {
    let mut store = load_store(&app);
    let summary = op_delete_nutrition(&mut store, day, &entry_id)?;
    save_store(&app, &store)?;
    Ok(summary)
}

#[tauri::command]
pub fn set_day_eva_hours(
    app: AppHandle,
    day: u32,
    eva_hours: f64,
) -> Result<WorkoutDaySummary, String> {
    let mut store = load_store(&app);
    let summary = op_set_eva_hours(&mut store, day, eva_hours)?;
    save_store(&app, &store)?;
    Ok(summary)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_has_at_least_eight_illustrative_protocols() {
        let cat = exercise_catalog();
        assert!(cat.len() >= 8);
        for p in &cat {
            assert_eq!(p.basis, "illustrative");
            assert!(!p.id.is_empty() && !p.name.is_empty());
        }
    }

    #[test]
    fn target_kcal_follows_nasa_std_3001_formula() {
        assert_eq!(compute_target_kcal(0.0), 3035);
        assert_eq!(compute_target_kcal(2.5), 3535);
        assert_eq!(compute_target_kcal(6.0), 4235);

        let mut store = WorkoutLogStore::default();
        let sum = op_set_eva_hours(&mut store, 78, 3.5).unwrap();
        assert_eq!(sum.target_kcal, 3735);
        assert_eq!(sum.kcal_basis, "nasa");
        assert_eq!(sum.workout_basis, "illustrative");
    }

    #[test]
    fn seed_is_idempotent_and_toggle_delete_work() {
        let mut store = WorkoutLogStore::default();
        let first = op_seed_default_day(&mut store, 78).unwrap();
        assert_eq!(first.total_sessions, 4);
        assert_eq!(first.completed_sessions, 0);
        assert!(first.total_exercise_min > 0);

        // Second seed does not duplicate entries when day already has workouts
        let second = op_seed_default_day(&mut store, 78).unwrap();
        assert_eq!(second.total_sessions, 4);

        let target_id = second.workouts[0].id.clone();
        let toggled = op_toggle_workout(&mut store, 78, &target_id).unwrap();
        assert_eq!(toggled.completed_sessions, 1);
        assert!(toggled.workouts[0].done);

        let deleted = op_delete_workout(&mut store, 78, &target_id).unwrap();
        assert_eq!(deleted.total_sessions, 3);
        assert_eq!(deleted.completed_sessions, 0);
    }

    #[test]
    fn nutrition_add_and_delete_aggregates_kcal_and_water() {
        let mut store = WorkoutLogStore::default();
        let s1 = op_add_nutrition(
            &mut store,
            78,
            "breakfast".into(),
            "Thermostabilized eggs & oatmeal".into(),
            650,
            Some(28.0),
            Some(350),
        )
        .unwrap();
        let s2 = op_add_nutrition(
            &mut store,
            78,
            "hydration".into(),
            "Electrolyte pouch".into(),
            40,
            None,
            Some(500),
        )
        .unwrap();

        assert_eq!(s2.total_kcal, 690);
        assert_eq!(s2.total_water_ml, 850);
        assert_eq!(s2.meals.len(), 2);

        let meal_id = s1.meals[0].id.clone();
        let after_del = op_delete_nutrition(&mut store, 78, &meal_id).unwrap();
        assert_eq!(after_del.total_kcal, 40);
        assert_eq!(after_del.total_water_ml, 500);
        assert_eq!(after_del.meals.len(), 1);
    }

    #[test]
    fn rejects_out_of_range_inputs() {
        let mut store = WorkoutLogStore::default();
        assert!(op_seed_default_day(&mut store, 0).is_err());
        assert!(op_seed_default_day(&mut store, 79).is_err());
        assert!(op_set_eva_hours(&mut store, 78, 13.0).is_err());
        assert!(op_set_eva_hours(&mut store, 78, f64::NAN).is_err());
        assert!(
            op_add_workout(
                &mut store,
                78,
                "ared_squat".into(),
                "Squat".into(),
                "ared".into(),
                241,
                None,
                None,
                None,
                None
            )
            .is_err()
        );
        assert!(
            op_add_nutrition(
                &mut store,
                78,
                "lunch".into(),
                "Meal".into(),
                5001,
                None,
                None
            )
            .is_err()
        );
        assert!(
            op_add_nutrition(
                &mut store,
                78,
                "hydration".into(),
                "Water".into(),
                0,
                None,
                Some(4001)
            )
            .is_err()
        );
    }

    #[test]
    fn corrupt_json_on_disk_falls_back_to_empty_store_and_roundtrips() {
        let path = std::env::temp_dir().join(format!(
            "selena_workout_corrupt_{}.json",
            std::process::id()
        ));
        let _ = fs::remove_file(&path);

        // Corrupt JSON falls back safely without panicking
        fs::write(&path, "{broken json").unwrap();
        let fallback = load_store_from_path(&path);
        assert_eq!(build_summary(78, fallback.days.get(&78)).total_sessions, 0);

        // Atomic save + reload round-trip preserves entries
        let mut store = WorkoutLogStore::default();
        op_seed_default_day(&mut store, 78).unwrap();
        save_store_to_path(&path, &store).unwrap();
        let reloaded = load_store_from_path(&path);
        assert_eq!(build_summary(78, reloaded.days.get(&78)).total_sessions, 4);

        let _ = fs::remove_file(&path);
    }
}