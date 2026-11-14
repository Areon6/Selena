//! Deterministic Mind & Body analytics over the persistent mission log.
//! Correlations require n >= 3 in both cohorts and are tagged `illustrative`.

use crate::lexicon::Sentiment;
use crate::mission_log::{DayEntry, DayLevel, DaySource, load_or_init};
use serde::Serialize;
use std::collections::HashMap;
use tauri::AppHandle;

const MIN_COHORT_DAYS: usize = 3;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsCoverage {
    pub total_days: u32,
    pub logged_days: usize,
    pub sample_days: usize,
    pub manual_days: usize,
    pub checkin_days: usize,
    pub import_days: usize,
    pub avg_mood: Option<f64>,
    pub avg_energy: Option<f64>,
    pub avg_stress: Option<f64>,
    pub avg_sleep: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoodPoint {
    pub day: u32,
    pub mood: Option<u8>,
    pub energy: Option<u8>,
    pub stress: Option<u8>,
    pub level: DayLevel,
    pub is_shift: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoodShift {
    pub from_day: u32,
    pub to_day: u32,
    pub delta_mood: Option<i8>,
    pub delta_stress: Option<i8>,
    pub from_mood: Option<u8>,
    pub to_mood: Option<u8>,
    pub from_stress: Option<u8>,
    pub to_stress: Option<u8>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeCount {
    pub id: String,
    pub count: usize,
    pub pct: f64,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SentimentCounts {
    pub positive: usize,
    pub mixed: usize,
    pub negative: usize,
    pub neutral: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CorrelationMetric {
    pub key: &'static str,
    pub unit: &'static str,
    pub cohort_a: f64,
    pub cohort_b: f64,
    pub delta: f64,
    pub higher_is_bad: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CorrelationPair {
    pub id: &'static str,
    #[serde(rename = "nA")]
    pub n_a: usize,
    #[serde(rename = "nB")]
    pub n_b: usize,
    pub available: bool,
    pub basis: &'static str,
    pub metric1: Option<CorrelationMetric>,
    pub metric2: Option<CorrelationMetric>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MindAnalytics {
    pub coverage: AnalyticsCoverage,
    pub mood_volatility: Option<f64>,
    pub stress_volatility: Option<f64>,
    pub series: Vec<MoodPoint>,
    pub shifts: Vec<MoodShift>,
    pub themes: Vec<ThemeCount>,
    pub sentiments: SentimentCounts,
    pub correlations: Vec<CorrelationPair>,
}

fn round1(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

fn mean(vals: &[f64]) -> Option<f64> {
    if vals.is_empty() {
        None
    } else {
        Some(vals.iter().sum::<f64>() / vals.len() as f64)
    }
}

fn std_dev(vals: &[f64]) -> Option<f64> {
    if vals.len() < 2 {
        return None;
    }
    let avg = mean(vals)?;
    let var = vals.iter().map(|v| (v - avg).powi(2)).sum::<f64>() / vals.len() as f64;
    Some(round2(var.sqrt()))
}

fn has_cognitive_or_fatigue_symptom(e: &DayEntry) -> bool {
    let tag_hit = e.tags.as_ref().is_some_and(|tags| {
        tags.iter()
            .any(|t| matches!(t.as_str(), "fatigue" | "brain_fog" | "weakness"))
    });
    let theme_hit = e.themes.as_ref().is_some_and(|themes| {
        themes
            .iter()
            .any(|t| matches!(t.as_str(), "cognitive_load" | "fatigue_sleep"))
    });
    tag_hit || theme_hit
}

fn mean_metric<F>(
    a: &[&DayEntry],
    b: &[&DayEntry],
    key: &'static str,
    unit: &'static str,
    higher_is_bad: bool,
    extract: F,
) -> Option<CorrelationMetric>
where
    F: Fn(&DayEntry) -> Option<f64>,
{
    let va: Vec<f64> = a.iter().filter_map(|e| extract(e)).collect();
    let vb: Vec<f64> = b.iter().filter_map(|e| extract(e)).collect();
    if va.len() < MIN_COHORT_DAYS || vb.len() < MIN_COHORT_DAYS {
        return None;
    }
    let avg_a = mean(&va)?;
    let avg_b = mean(&vb)?;
    Some(CorrelationMetric {
        key,
        unit,
        cohort_a: round2(avg_a),
        cohort_b: round2(avg_b),
        delta: round2(avg_a - avg_b),
        higher_is_bad,
    })
}

fn pct_metric<F>(
    a: &[&DayEntry],
    b: &[&DayEntry],
    key: &'static str,
    higher_is_bad: bool,
    pred: F,
) -> Option<CorrelationMetric>
where
    F: Fn(&DayEntry) -> bool,
{
    if a.len() < MIN_COHORT_DAYS || b.len() < MIN_COHORT_DAYS {
        return None;
    }
    let pct_a = 100.0 * a.iter().filter(|e| pred(e)).count() as f64 / a.len() as f64;
    let pct_b = 100.0 * b.iter().filter(|e| pred(e)).count() as f64 / b.len() as f64;
    Some(CorrelationMetric {
        key,
        unit: "%",
        cohort_a: round1(pct_a),
        cohort_b: round1(pct_b),
        delta: round1(pct_a - pct_b),
        higher_is_bad,
    })
}

pub fn compute_analytics(total_days: u32, raw_entries: &[DayEntry]) -> MindAnalytics {
    let mut entries = raw_entries.to_vec();
    entries.sort_by_key(|e| e.day);

    let mut sample_days = 0usize;
    let mut manual_days = 0usize;
    let mut checkin_days = 0usize;
    let mut import_days = 0usize;

    let mut moods = Vec::new();
    let mut energies = Vec::new();
    let mut stresses = Vec::new();
    let mut sleeps = Vec::new();

    let mut theme_counts: HashMap<String, usize> = HashMap::new();
    let mut psych_annotated_days = 0usize;
    let mut sentiments = SentimentCounts::default();

    for e in &entries {
        match e.source.unwrap_or(DaySource::Sample) {
            DaySource::Sample => sample_days += 1,
            DaySource::Manual => manual_days += 1,
            DaySource::Checkin => checkin_days += 1,
            DaySource::Import => import_days += 1,
        }
        if let Some(m) = e.mood {
            moods.push(m as f64);
        }
        if let Some(en) = e.energy {
            energies.push(en as f64);
        }
        if let Some(s) = e.stress {
            stresses.push(s as f64);
        }
        if let Some(sl) = e.sleep_hours {
            sleeps.push(sl);
        }

        let has_psych_text = e.note.as_ref().is_some_and(|n| !n.trim().is_empty())
            || e.tags.as_ref().is_some_and(|t| !t.is_empty());

        if has_psych_text {
            psych_annotated_days += 1;
            if let Some(sent) = e.sentiment {
                match sent {
                    Sentiment::Positive => sentiments.positive += 1,
                    Sentiment::Mixed => sentiments.mixed += 1,
                    Sentiment::Negative => sentiments.negative += 1,
                    Sentiment::Neutral => sentiments.neutral += 1,
                }
            }
        }

        if let Some(themes) = &e.themes {
            for t in themes {
                *theme_counts.entry(t.clone()).or_insert(0) += 1;
            }
        }
    }

    // Series & sharp shifts (|Δmood| >= 2 or |Δstress| >= 2 between consecutive logged entries)
    let psych_entries: Vec<&DayEntry> = entries
        .iter()
        .filter(|e| e.mood.is_some() || e.stress.is_some() || e.energy.is_some())
        .collect();

    let mut shifts = Vec::new();
    let mut shift_days: HashMap<u32, bool> = HashMap::new();

    for pair in psych_entries.windows(2) {
        let prev = pair[0];
        let curr = pair[1];
        let dm = match (prev.mood, curr.mood) {
            (Some(a), Some(b)) => Some(b as i8 - a as i8),
            _ => None,
        };
        let ds = match (prev.stress, curr.stress) {
            (Some(a), Some(b)) => Some(b as i8 - a as i8),
            _ => None,
        };
        let is_sharp = dm.is_some_and(|d| d.abs() >= 2) || ds.is_some_and(|d| d.abs() >= 2);
        if is_sharp {
            shift_days.insert(curr.day, true);
            shifts.push(MoodShift {
                from_day: prev.day,
                to_day: curr.day,
                delta_mood: dm,
                delta_stress: ds,
                from_mood: prev.mood,
                to_mood: curr.mood,
                from_stress: prev.stress,
                to_stress: curr.stress,
            });
        }
    }

    let series = psych_entries
        .iter()
        .map(|e| MoodPoint {
            day: e.day,
            mood: e.mood,
            energy: e.energy,
            stress: e.stress,
            level: e.level.unwrap_or(DayLevel::Nominal),
            is_shift: *shift_days.get(&e.day).unwrap_or(&false),
        })
        .collect();

    // Theme frequency ranking
    let denom = psych_annotated_days.max(1) as f64;
    let mut themes: Vec<ThemeCount> = theme_counts
        .into_iter()
        .map(|(id, count)| ThemeCount {
            id,
            count,
            pct: round1(100.0 * count as f64 / denom),
        })
        .collect();
    themes.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.id.cmp(&b.id)));

    // Mind <-> Body associative cohorts (n >= 3 required in both cohorts)
    let sleep_a: Vec<&DayEntry> = entries
        .iter()
        .filter(|e| e.sleep_hours.is_some_and(|h| h < 7.0))
        .collect();
    let sleep_b: Vec<&DayEntry> = entries
        .iter()
        .filter(|e| e.sleep_hours.is_some_and(|h| h >= 7.0))
        .collect();
    let sleep_ok = sleep_a.len() >= MIN_COHORT_DAYS && sleep_b.len() >= MIN_COHORT_DAYS;
    let sleep_corr = CorrelationPair {
        id: "sleep_vs_mood",
        n_a: sleep_a.len(),
        n_b: sleep_b.len(),
        available: sleep_ok,
        basis: "illustrative",
        metric1: if sleep_ok {
            mean_metric(&sleep_a, &sleep_b, "mood", "pts", false, |e| {
                e.mood.map(f64::from)
            })
        } else {
            None
        },
        metric2: if sleep_ok {
            mean_metric(&sleep_a, &sleep_b, "stress", "pts", true, |e| {
                e.stress.map(f64::from)
            })
        } else {
            None
        },
    };

    let co2_a: Vec<&DayEntry> = entries
        .iter()
        .filter(|e| e.ppco2.is_some_and(|c| c >= 3.0))
        .collect();
    let co2_b: Vec<&DayEntry> = entries
        .iter()
        .filter(|e| e.ppco2.is_some_and(|c| c < 3.0))
        .collect();
    let co2_ok = co2_a.len() >= MIN_COHORT_DAYS && co2_b.len() >= MIN_COHORT_DAYS;
    let co2_corr = CorrelationPair {
        id: "co2_vs_cognition",
        n_a: co2_a.len(),
        n_b: co2_b.len(),
        available: co2_ok,
        basis: "illustrative",
        metric1: if co2_ok {
            pct_metric(
                &co2_a,
                &co2_b,
                "fatigueCogPct",
                true,
                has_cognitive_or_fatigue_symptom,
            )
        } else {
            None
        },
        metric2: if co2_ok {
            mean_metric(&co2_a, &co2_b, "energy", "pts", false, |e| {
                e.energy.map(f64::from)
            })
        } else {
            None
        },
    };

    let stress_a: Vec<&DayEntry> = entries
        .iter()
        .filter(|e| e.stress.is_some_and(|s| s >= 4))
        .collect();
    let stress_b: Vec<&DayEntry> = entries
        .iter()
        .filter(|e| e.stress.is_some_and(|s| s <= 3))
        .collect();
    let stress_ok = stress_a.len() >= MIN_COHORT_DAYS && stress_b.len() >= MIN_COHORT_DAYS;
    let stress_corr = CorrelationPair {
        id: "stress_vs_sleep",
        n_a: stress_a.len(),
        n_b: stress_b.len(),
        available: stress_ok,
        basis: "illustrative",
        metric1: if stress_ok {
            mean_metric(&stress_a, &stress_b, "sleep", "h", false, |e| e.sleep_hours)
        } else {
            None
        },
        metric2: if stress_ok {
            mean_metric(&stress_a, &stress_b, "hr", "bpm", true, |e| e.hr)
        } else {
            None
        },
    };

    MindAnalytics {
        coverage: AnalyticsCoverage {
            total_days,
            logged_days: entries.len(),
            sample_days,
            manual_days,
            checkin_days,
            import_days,
            avg_mood: mean(&moods).map(round2),
            avg_energy: mean(&energies).map(round2),
            avg_stress: mean(&stresses).map(round2),
            avg_sleep: mean(&sleeps).map(round2),
        },
        mood_volatility: std_dev(&moods),
        stress_volatility: std_dev(&stresses),
        series,
        shifts,
        themes,
        sentiments,
        correlations: vec![sleep_corr, co2_corr, stress_corr],
    }
}

#[tauri::command]
pub fn get_mind_analytics(app: AppHandle) -> Result<MindAnalytics, String> {
    let log = load_or_init(&app);
    Ok(compute_analytics(log.current_day, &log.entries))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mission_log::generate_sample_history;

    #[test]
    fn sample_history_yields_all_three_correlations() {
        let entries = generate_sample_history();
        let res = compute_analytics(78, &entries);
        assert_eq!(res.coverage.logged_days, 35);
        assert_eq!(res.correlations.len(), 3);
        for c in &res.correlations {
            assert!(c.available, "cohort {} should have n >= 3", c.id);
            assert!(c.n_a >= 3 && c.n_b >= 3);
            assert_eq!(c.basis, "illustrative");
        }
        // Sleep < 7h should associate with lower mood (negative delta)
        let sleep_m1 = res.correlations[0].metric1.as_ref().unwrap();
        assert!(sleep_m1.delta < 0.0);
        // ppCO2 >= 3.0 should associate with higher fatigue/cognitive symptom %
        let co2_m1 = res.correlations[1].metric1.as_ref().unwrap();
        assert_eq!(co2_m1.unit, "%");
        assert!(co2_m1.delta > 0.0);
    }

    #[test]
    fn enforces_minimum_cohort_size_of_three() {
        let entries = generate_sample_history().into_iter().take(4).collect::<Vec<_>>();
        let res = compute_analytics(78, &entries);
        for c in &res.correlations {
            assert!(!c.available);
            assert!(c.metric1.is_none());
        }
    }
}