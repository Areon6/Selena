//! Stage 4: Deterministic offline CSV/JSON device telemetry importer
//! and Houston micro-report file exporter.
//!
//! Units are strictly NASA-STD-3001 aligned:
//! - ppCO2 in mmHg (rejects % columns/keys)
//! - Radiation dose rate in µSv/h (rejects mSv dose-rate columns/keys)

use crate::mission_log::{self, CURRENT_MISSION_DAY, DayEntry, DaySource, MissionLog};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Default)]
pub struct ParsedDeviceRow {
    line: usize,
    day: u32,
    hr: Option<f64>,
    bp_sys: Option<f64>,
    bp_dia: Option<f64>,
    spo2: Option<f64>,
    ppco2: Option<f64>,
    sleep_hours: Option<f64>,
    dose_usv_h: Option<f64>,
    mood: Option<u8>,
    energy: Option<u8>,
    stress: Option<u8>,
    tags: Option<Vec<String>>,
    note: Option<String>,
}

impl ParsedDeviceRow {
    fn has_any_metric(&self) -> bool {
        self.hr.is_some()
            || self.bp_sys.is_some()
            || self.bp_dia.is_some()
            || self.spo2.is_some()
            || self.ppco2.is_some()
            || self.sleep_hours.is_some()
            || self.dose_usv_h.is_some()
            || self.mood.is_some()
            || self.energy.is_some()
            || self.stress.is_some()
            || self.note.is_some()
            || self.tags.as_ref().is_some_and(|t| !t.is_empty())
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub format: &'static str,
    pub imported_days: usize,
    pub updated_days: usize,
    pub skipped_rows: usize,
    pub warnings: Vec<String>,
    pub log: MissionLog,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CsvCol {
    Day,
    Hr,
    BpSys,
    BpDia,
    Spo2,
    Ppco2,
    SleepH,
    DoseUsv,
    Ignore,
}

fn map_csv_header(raw: &str) -> Result<CsvCol, String> {
    let key = raw.trim().trim_matches('"').to_ascii_lowercase();
    match key.as_str() {
        "day" | "mission_day" => Ok(CsvCol::Day),
        "hr" | "heart_rate" | "pulse" => Ok(CsvCol::Hr),
        "bp_sys" | "bpsys" | "systolic" => Ok(CsvCol::BpSys),
        "bp_dia" | "bpdia" | "diastolic" => Ok(CsvCol::BpDia),
        "spo2" => Ok(CsvCol::Spo2),
        "ppco2" | "co2_mmhg" | "ppco2_mmhg" => Ok(CsvCol::Ppco2),
        "sleep_h" | "sleep" | "sleep_hours" => Ok(CsvCol::SleepH),
        "dose_usv" | "dose_usv_h" | "dose" | "dose_rate_usv_h" => Ok(CsvCol::DoseUsv),
        "ppco2_pct" | "co2_pct" | "co2%" | "ppco2%" => Err(
            "Forbidden unit in header: ppCO2 must be in mmHg (column `ppco2`), never %."
                .to_string(),
        ),
        "dose_msv" | "dose_msv_h" => Err(
            "Forbidden unit in header: radiation dose rate must be in µSv/h (column `dose_usv`)."
                .to_string(),
        ),
        _ => Ok(CsvCol::Ignore),
    }
}

fn is_empty_cell(s: &str) -> bool {
    let t = s.trim().trim_matches('"');
    t.is_empty() || t.eq_ignore_ascii_case("na") || t.eq_ignore_ascii_case("n/a") || t == "-"
}

fn validate_range(label: &str, v: f64, lo: f64, hi: f64) -> Result<f64, String> {
    if !v.is_finite() || v < lo || v > hi {
        return Err(format!("{label} ({v}) out of accepted range {lo}..={hi}"));
    }
    Ok(v)
}

fn parse_cell_f64(cell: &str, label: &str, lo: f64, hi: f64) -> Result<Option<f64>, String> {
    if is_empty_cell(cell) {
        return Ok(None);
    }
    let cleaned = cell.trim().trim_matches('"');
    let v: f64 = cleaned
        .parse()
        .map_err(|_| format!("invalid number for {label}: `{cleaned}`"))?;
    Ok(Some(validate_range(label, v, lo, hi)?))
}

pub fn parse_csv(raw: &str) -> Result<(Vec<ParsedDeviceRow>, Vec<String>, usize), String> {
    let text = raw.strip_prefix('\u{feff}').unwrap_or(raw);
    let mut lines = text.lines().enumerate().filter(|(_, l)| {
        let t = l.trim();
        !t.is_empty() && !t.starts_with('#')
    });

    let Some((_, header_line)) = lines.next() else {
        return Err("CSV payload is empty.".into());
    };

    let delim = if header_line.contains(';') && !header_line.contains(',') {
        ';'
    } else {
        ','
    };

    let mut cols = Vec::new();
    for h in header_line.split(delim) {
        cols.push(map_csv_header(h)?);
    }
    if !cols.contains(&CsvCol::Day) {
        return Err("CSV header must contain a `day` column (e.g. day,hr,bp_sys,bp_dia,spo2,ppco2,sleep_h,dose_usv).".into());
    }

    let mut valid = Vec::new();
    let mut warnings = Vec::new();
    let mut skipped = 0usize;

    for (idx, line) in lines {
        let line_no = idx + 1;
        let cells: Vec<&str> = line.split(delim).collect();
        let mut row = ParsedDeviceRow {
            line: line_no,
            ..Default::default()
        };
        let mut day_opt: Option<u32> = None;
        let mut row_err: Option<String> = None;

        for (col_idx, col_kind) in cols.iter().enumerate() {
            let cell = cells.get(col_idx).copied().unwrap_or("");
            match col_kind {
                CsvCol::Day => {
                    let t = cell.trim().trim_matches('"');
                    match t.parse::<u32>() {
                        Ok(d) if (1..=CURRENT_MISSION_DAY).contains(&d) => day_opt = Some(d),
                        _ => {
                            row_err = Some(format!(
                                "Line {line_no}: invalid day `{t}` (must be 1..={CURRENT_MISSION_DAY})"
                            ));
                            break;
                        }
                    }
                }
                CsvCol::Hr => match parse_cell_f64(cell, "hr", 30.0, 220.0) {
                    Ok(v) => row.hr = v,
                    Err(e) => {
                        row_err = Some(format!("Line {line_no}: {e}"));
                        break;
                    }
                },
                CsvCol::BpSys => match parse_cell_f64(cell, "bp_sys", 60.0, 260.0) {
                    Ok(v) => row.bp_sys = v,
                    Err(e) => {
                        row_err = Some(format!("Line {line_no}: {e}"));
                        break;
                    }
                },
                CsvCol::BpDia => match parse_cell_f64(cell, "bp_dia", 35.0, 160.0) {
                    Ok(v) => row.bp_dia = v,
                    Err(e) => {
                        row_err = Some(format!("Line {line_no}: {e}"));
                        break;
                    }
                },
                CsvCol::Spo2 => match parse_cell_f64(cell, "spo2", 70.0, 100.0) {
                    Ok(v) => row.spo2 = v,
                    Err(e) => {
                        row_err = Some(format!("Line {line_no}: {e}"));
                        break;
                    }
                },
                CsvCol::Ppco2 => match parse_cell_f64(cell, "ppco2 (mmHg)", 0.0, 25.0) {
                    Ok(v) => row.ppco2 = v,
                    Err(e) => {
                        row_err = Some(format!("Line {line_no}: {e}"));
                        break;
                    }
                },
                CsvCol::SleepH => match parse_cell_f64(cell, "sleep_h", 0.0, 16.0) {
                    Ok(v) => row.sleep_hours = v,
                    Err(e) => {
                        row_err = Some(format!("Line {line_no}: {e}"));
                        break;
                    }
                },
                CsvCol::DoseUsv => match parse_cell_f64(cell, "dose_usv (µSv/h)", 0.0, 50_000.0) {
                    Ok(v) => row.dose_usv_h = v,
                    Err(e) => {
                        row_err = Some(format!("Line {line_no}: {e}"));
                        break;
                    }
                },
                CsvCol::Ignore => {}
            }
        }

        if let Some(err) = row_err {
            skipped += 1;
            warnings.push(err);
            continue;
        }
        let Some(day) = day_opt else {
            skipped += 1;
            warnings.push(format!("Line {line_no}: missing day"));
            continue;
        };
        row.day = day;

        if let (Some(sys), Some(dia)) = (row.bp_sys, row.bp_dia)
            && sys <= dia {
                skipped += 1;
                warnings.push(format!("Line {line_no}: bp_sys ({sys}) must exceed bp_dia ({dia})"));
                continue;
            }
        if !row.has_any_metric() {
            skipped += 1;
            warnings.push(format!("Line {line_no}: no physiological metrics provided"));
            continue;
        }
        valid.push(row);
    }

    Ok((valid, warnings, skipped))
}

fn json_opt_f64(
    map: &serde_json::Map<String, Value>,
    keys: &[&str],
    label: &str,
    lo: f64,
    hi: f64,
) -> Result<Option<f64>, String> {
    for &k in keys {
        if let Some(val) = map.get(k) {
            if val.is_null() {
                return Ok(None);
            }
            let num = val
                .as_f64()
                .ok_or_else(|| format!("{label} (`{k}`) must be a number"))?;
            return Ok(Some(validate_range(label, num, lo, hi)?));
        }
    }
    Ok(None)
}

fn json_opt_scale(
    map: &serde_json::Map<String, Value>,
    key: &str,
) -> Result<Option<u8>, String> {
    let Some(val) = map.get(key) else {
        return Ok(None);
    };
    if val.is_null() {
        return Ok(None);
    }
    let n = val
        .as_u64()
        .ok_or_else(|| format!("{key} must be an integer 1..=5"))?;
    if !(1..=5).contains(&n) {
        return Err(format!("{key} ({n}) out of accepted range 1..=5"));
    }
    Ok(Some(n as u8))
}

fn json_opt_note(map: &serde_json::Map<String, Value>) -> Result<Option<String>, String> {
    let Some(val) = map.get("note") else {
        return Ok(None);
    };
    if val.is_null() {
        return Ok(None);
    }
    let s = val.as_str().ok_or_else(|| "note must be a string".to_string())?;
    let trimmed: String = s.trim().chars().take(500).collect();
    if trimmed.is_empty() {
        Ok(None)
    } else {
        Ok(Some(trimmed))
    }
}

fn json_opt_tags(map: &serde_json::Map<String, Value>) -> Result<Option<Vec<String>>, String> {
    let Some(val) = map.get("tags") else {
        return Ok(None);
    };
    if val.is_null() {
        return Ok(None);
    }
    let arr = val
        .as_array()
        .ok_or_else(|| "tags must be an array of strings".to_string())?;
    let mut out = Vec::new();
    for item in arr {
        let s = item
            .as_str()
            .ok_or_else(|| "each tag must be a string".to_string())?;
        let t = s.trim();
        if !t.is_empty() {
            out.push(t.chars().take(40).collect());
        }
    }
    if out.is_empty() {
        Ok(None)
    } else {
        Ok(Some(out))
    }
}

pub fn parse_json(raw: &str) -> Result<(Vec<ParsedDeviceRow>, Vec<String>, usize), String> {
    let val: Value =
        serde_json::from_str(raw).map_err(|e| format!("Invalid JSON syntax: {e}"))?;

    let items: Vec<Value> = match val {
        Value::Array(arr) => arr,
        Value::Object(mut map) => {
            if let Some(Value::Array(arr)) = map.remove("entries") {
                arr
            } else if let Some(Value::Array(arr)) = map.remove("days") {
                arr
            } else if map.contains_key("day") {
                vec![Value::Object(map)]
            } else {
                return Err(
                    "JSON must be an array of day objects or an object with `entries` / `days`."
                        .into(),
                );
            }
        }
        _ => return Err("JSON root must be an array or object.".into()),
    };

    let mut valid = Vec::new();
    let mut warnings = Vec::new();
    let mut skipped = 0usize;

    for (idx, item) in items.into_iter().enumerate() {
        let row_no = idx + 1;
        let Some(map) = item.as_object() else {
            skipped += 1;
            warnings.push(format!("Entry #{row_no}: expected JSON object"));
            continue;
        };

        if map.contains_key("ppco2_pct") || map.contains_key("ppco2Pct") || map.contains_key("co2_pct") || map.contains_key("co2Pct") {
            skipped += 1;
            warnings.push(format!("Entry #{row_no}: forbidden unit (%) — ppCO2 must be in mmHg"));
            continue;
        }
        if map.contains_key("dose_msv") || map.contains_key("doseMsv") {
            skipped += 1;
            warnings.push(format!("Entry #{row_no}: forbidden unit (mSv) — dose rate must be in µSv/h"));
            continue;
        }

        let day = match map.get("day").and_then(|v| v.as_u64()) {
            Some(d) if (1..=CURRENT_MISSION_DAY as u64).contains(&d) => d as u32,
            _ => {
                skipped += 1;
                warnings.push(format!(
                    "Entry #{row_no}: invalid or missing `day` (1..={CURRENT_MISSION_DAY})"
                ));
                continue;
            }
        };

        let parsed = (|| -> Result<ParsedDeviceRow, String> {
            let hr = json_opt_f64(map, &["hr", "heartRate", "heart_rate", "pulse"], "hr", 30.0, 220.0)?;
            let bp_sys = json_opt_f64(map, &["bp_sys", "bpSys", "systolic"], "bp_sys", 60.0, 260.0)?;
            let bp_dia = json_opt_f64(map, &["bp_dia", "bpDia", "diastolic"], "bp_dia", 35.0, 160.0)?;
            if let (Some(sys), Some(dia)) = (bp_sys, bp_dia)
                && sys <= dia {
                    return Err(format!("bp_sys ({sys}) must exceed bp_dia ({dia})"));
                }
            let spo2 = json_opt_f64(map, &["spo2", "spO2"], "spo2", 70.0, 100.0)?;
            let ppco2 = json_opt_f64(map, &["ppco2", "ppCO2", "co2_mmhg", "co2Mmhg"], "ppco2 (mmHg)", 0.0, 25.0)?;
            let sleep_hours = json_opt_f64(map, &["sleep_h", "sleepH", "sleep_hours", "sleepHours", "sleep"], "sleep_h", 0.0, 16.0)?;
            let dose_usv_h = json_opt_f64(map, &["dose_usv", "doseUsv", "dose_usv_h", "doseUsvH", "dose"], "dose_usv (µSv/h)", 0.0, 50_000.0)?;
            let mood = json_opt_scale(map, "mood")?;
            let energy = json_opt_scale(map, "energy")?;
            let stress = json_opt_scale(map, "stress")?;
            let tags = json_opt_tags(map)?;
            let note = json_opt_note(map)?;

            Ok(ParsedDeviceRow {
                line: row_no,
                day,
                hr,
                bp_sys,
                bp_dia,
                spo2,
                ppco2,
                sleep_hours,
                dose_usv_h,
                mood,
                energy,
                stress,
                tags,
                note,
            })
        })();

        match parsed {
            Ok(row) if row.has_any_metric() => valid.push(row),
            Ok(_) => {
                skipped += 1;
                warnings.push(format!("Entry #{row_no}: no physiological metrics provided"));
            }
            Err(e) => {
                skipped += 1;
                warnings.push(format!("Entry #{row_no}: {e}"));
            }
        }
    }

    Ok((valid, warnings, skipped))
}

pub fn merge_rows_into_log(
    log: &mut MissionLog,
    rows: Vec<ParsedDeviceRow>,
    warnings: &mut Vec<String>,
    skipped: &mut usize,
) -> (usize, usize) {
    let mut created_days = HashSet::new();
    let mut updated_days = HashSet::new();

    for row in rows {
        if let Some(pos) = log.entries.iter().position(|e| e.day == row.day) {
            let mut merged = log.entries[pos].clone();
            if row.hr.is_some() {
                merged.hr = row.hr;
            }
            if row.bp_sys.is_some() {
                merged.bp_sys = row.bp_sys;
            }
            if row.bp_dia.is_some() {
                merged.bp_dia = row.bp_dia;
            }
            if row.spo2.is_some() {
                merged.spo2 = row.spo2;
            }
            if row.ppco2.is_some() {
                merged.ppco2 = row.ppco2;
            }
            if row.sleep_hours.is_some() {
                merged.sleep_hours = row.sleep_hours;
            }
            if row.dose_usv_h.is_some() {
                merged.dose_usv_h = row.dose_usv_h;
            }
            if row.mood.is_some() {
                merged.mood = row.mood;
            }
            if row.energy.is_some() {
                merged.energy = row.energy;
            }
            if row.stress.is_some() {
                merged.stress = row.stress;
            }
            if row.tags.is_some() {
                merged.tags = row.tags;
            }
            if row.note.is_some() {
                merged.note = row.note;
            }
            merged.source = Some(DaySource::Import);

            match mission_log::sanitize_entry(merged) {
                Ok(clean) => {
                    log.entries[pos] = clean;
                    if !created_days.contains(&row.day) {
                        updated_days.insert(row.day);
                    }
                }
                Err(e) => {
                    *skipped += 1;
                    warnings.push(format!("Row {} (Day {}): {e}", row.line, row.day));
                }
            }
        } else {
            let entry = DayEntry {
                day: row.day,
                source: Some(DaySource::Import),
                hr: row.hr,
                bp_sys: row.bp_sys,
                bp_dia: row.bp_dia,
                spo2: row.spo2,
                ppco2: row.ppco2,
                sleep_hours: row.sleep_hours,
                dose_usv_h: row.dose_usv_h,
                mood: row.mood,
                energy: row.energy,
                stress: row.stress,
                tags: row.tags,
                note: row.note,
                ..Default::default()
            };
            match mission_log::sanitize_entry(entry) {
                Ok(clean) => {
                    log.entries.push(clean);
                    created_days.insert(row.day);
                }
                Err(e) => {
                    *skipped += 1;
                    warnings.push(format!("Row {} (Day {}): {e}", row.line, row.day));
                }
            }
        }
    }

    log.entries.sort_by_key(|e| e.day);
    (created_days.len(), updated_days.len())
}

#[tauri::command]
pub fn import_device_log(app: AppHandle, payload: String) -> Result<ImportResult, String> {
    let trimmed = payload.trim();
    if trimmed.is_empty() {
        return Err("Paste or load a CSV/JSON device export first.".into());
    }

    let is_json = trimmed.starts_with('[') || trimmed.starts_with('{');
    let format = if is_json { "json" } else { "csv" };

    let (rows, mut warnings, mut skipped) = if is_json {
        parse_json(trimmed)?
    } else {
        parse_csv(trimmed)?
    };

    if rows.is_empty() {
        let first_warn = warnings
            .first()
            .cloned()
            .unwrap_or_else(|| "No valid rows found in payload.".into());
        return Err(first_warn);
    }

    let mut log = mission_log::load_or_init(&app);
    let (imported_days, updated_days) =
        merge_rows_into_log(&mut log, rows, &mut warnings, &mut skipped);

    if imported_days == 0 && updated_days == 0 {
        let first_warn = warnings
            .first()
            .cloned()
            .unwrap_or_else(|| "No valid entries could be merged.".into());
        return Err(first_warn);
    }

    mission_log::save_log(&app, &log)?;

    Ok(ImportResult {
        format,
        imported_days,
        updated_days,
        skipped_rows: skipped,
        warnings,
        log,
    })
}

fn sanitize_filename(name: &str) -> String {
    let base: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        .collect();
    let trimmed = base.trim_matches('.');
    if trimmed.ends_with(".md") || trimmed.ends_with(".json") {
        trimmed.to_string()
    } else {
        "selena-houston-report.md".to_string()
    }
}

fn resolve_export_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(dl) = app.path().download_dir()
        && fs::create_dir_all(&dl).is_ok() {
            return Ok(dl);
        }
    let data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("export directory unavailable: {e}"))?;
    let exports = data.join("exports");
    fs::create_dir_all(&exports).map_err(|e| format!("cannot create exports dir: {e}"))?;
    Ok(exports)
}

#[tauri::command]
pub fn export_houston_report(
    app: AppHandle,
    filename: String,
    content: String,
) -> Result<String, String> {
    if content.trim().is_empty() {
        return Err("Report content is empty.".into());
    }
    let safe_name = sanitize_filename(&filename);
    let dir = resolve_export_dir(&app)?;
    let path = dir.join(&safe_name);
    let tmp = dir.join(format!("{safe_name}.tmp"));
    fs::write(&tmp, content.as_bytes()).map_err(|e| format!("export write failed: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("export rename failed: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lexicon::Sentiment;
    use crate::mission_log::{DayLevel, generate_sample_history};

    #[test]
    fn parses_valid_csv_and_merges_into_empty_and_existing_days() {
        let csv = "\
# Sample portable device export (ppCO2 in mmHg, dose in uSv/h)
day,hr,bp_sys,bp_dia,spo2,ppco2,sleep_h,dose_usv
73,67,120,76,97.5,2.4,7.4,40
74,83,133,84,96.4,3.4,6.2,43
75,71,124,78,97.2,2.5,7.0,41
";
        let (rows, warnings, skipped) = parse_csv(csv).expect("csv should parse");
        assert_eq!(rows.len(), 3);
        assert_eq!(skipped, 0);
        assert!(warnings.is_empty());

        let mut log = MissionLog {
            current_day: CURRENT_MISSION_DAY,
            entries: generate_sample_history(),
        };
        let mut merge_warns = Vec::new();
        let mut merge_skipped = 0;
        let (created, updated) =
            merge_rows_into_log(&mut log, rows, &mut merge_warns, &mut merge_skipped);

        assert_eq!(created, 2);
        assert_eq!(updated, 1);
        assert_eq!(merge_skipped, 0);

        let d75 = log.entries.iter().find(|e| e.day == 75).unwrap();
        assert_eq!(d75.source, Some(DaySource::Import));
        assert_eq!(d75.hr, Some(71.0));
        assert!(d75.note.as_deref().unwrap().contains("Quiet watch shift"));
    }

    #[test]
    fn rejects_percent_ppco2_and_msv_dose_units() {
        let bad_csv = "day,hr,ppco2_pct\n73,70,0.4\n";
        assert!(parse_csv(bad_csv).is_err());

        let bad_json = r#"[{"day":73,"hr":70,"co2_pct":0.5}]"#;
        let (rows, warnings, skipped) = parse_json(bad_json).unwrap();
        assert!(rows.is_empty());
        assert_eq!(skipped, 1);
        assert!(warnings[0].contains("mmHg"));
    }

    #[test]
    fn skips_bad_csv_rows_without_losing_valid_ones() {
        let csv = "\
day,hr,bp_sys,bp_dia,ppco2,sleep_h,dose_usv
73,70,120,76,2.5,7.5,40
99,70,120,76,2.5,7.5,40
74,70,110,120,2.5,7.5,40
76,72,118,75,3.2,6.4,240
";
        let (rows, warnings, skipped) = parse_csv(csv).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(skipped, 2);
        assert_eq!(warnings.len(), 2);
    }

    #[test]
    fn parses_json_wrapper_with_camel_case_aliases() {
        let json = r#"{
          "entries": [
            { "day": 76, "hr": 66, "bpSys": 119, "bpDia": 75, "spo2": 97.8, "ppco2": 2.4, "sleepHours": 7.6, "doseUsvH": 39 },
            { "day": 77, "hr": 80, "ppco2": 3.5, "sleepHours": 6.1, "doseUsvH": 45 }
          ]
        }"#;
        let (rows, warnings, skipped) = parse_json(json).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(skipped, 0);
        assert!(warnings.is_empty());
        assert_eq!(rows[0].sleep_hours, Some(7.6));
        assert_eq!(rows[1].dose_usv_h, Some(45.0));
    }

    #[test]
    fn handles_csv_bom_semicolon_na_cells_and_boundary_values() {
        let csv = "\u{feff}day;hr;bp_sys;bp_dia;spo2;ppco2;sleep_h;dose_usv\n\
                   1;30;60;35;70;0.0;0.0;0\n\
                   78;220;260;160;100;25.0;16.0;50000\n\
                   0;70;120;80;97;2.4;7.5;40\n\
                   79;70;120;80;97;2.4;7.5;40\n\
                   73;NA;120;120;97;2.4;7.5;40\n\
                   74;70;120;80;97;25.1;7.5;40\n\
                   75;70;120;80;97;2.4;7.5;50001\n";
        let (rows, warnings, skipped) = parse_csv(csv).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].day, 1);
        assert_eq!(rows[1].day, 78);
        assert_eq!(skipped, 5);
        assert_eq!(warnings.len(), 5);
    }

    #[test]
    fn imports_spe_json_with_note_tags_and_enriches_lexicon() {
        let json = r#"[
          {
            "day": 76,
            "hr": 102,
            "bp_sys": 146,
            "bp_dia": 92,
            "spo2": 96.4,
            "ppco2": 2.7,
            "sleep_h": 4.9,
            "dose_usv": 1850,
            "mood": 2,
            "stress": 5,
            "tags": ["fatigue", "poor_sleep"],
            "note": "Solar particle event alarm — 4 hours in storm shelter. Severe fatigue and headache."
          }
        ]"#;
        let (rows, warnings, skipped) = parse_json(json).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(skipped, 0);
        assert!(warnings.is_empty());

        let mut log = MissionLog {
            current_day: CURRENT_MISSION_DAY,
            entries: generate_sample_history(),
        };
        let (created, updated) =
            merge_rows_into_log(&mut log, rows, &mut Vec::new(), &mut 0);
        assert_eq!(created, 1);
        assert_eq!(updated, 0);

        let d76 = log.entries.iter().find(|e| e.day == 76).unwrap();
        assert_eq!(d76.level, Some(DayLevel::Critical));
        assert_eq!(d76.sentiment, Some(Sentiment::Negative));
        assert!(d76.themes.as_ref().unwrap().contains(&"fatigue_sleep".to_string()));
        assert!(d76.themes.as_ref().unwrap().contains(&"cognitive_load".to_string()));
    }
}