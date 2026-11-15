use selena_lib::mission_log::{DayEntry, DayLevel, MissionLog, compute_level_rank, generate_sample_history};
use selena_lib::{analytics, crew_profile, importer, lexicon, workout_log};
use std::fmt::Write as _;
use std::hint::black_box;
use std::time::{Duration, Instant};

fn rate(n: usize, d: Duration) -> f64 {
    n as f64 / d.as_secs_f64().max(1e-9)
}

#[test]
fn bench_01_flight_deck_telemetry_and_ipc_json() {
    let n = if cfg!(debug_assertions) { 5_000 } else { 50_000 };
    let t0 = Instant::now();
    let (done, bytes) = selena_lib::bench_telemetry_steps(n, true, true);
    let dt = t0.elapsed();
    let mb_s = (bytes as f64 / (1024.0 * 1024.0)) / dt.as_secs_f64().max(1e-9);
    assert_eq!(done, n);
    assert!(bytes > n * 1000);
    println!("[1/7] Telemetry+JSON IPC: {n} snaps in {:.2} ms | {:.0} snaps/s | {:.2} us/op | {:.1} MB/s JSON", dt.as_secs_f64() * 1e3, rate(n, dt), dt.as_secs_f64() * 1e6 / n as f64, mb_s);
}

#[test]
fn bench_02_device_importer_csv_and_json_load() {
    let csv_n = if cfg!(debug_assertions) { 2_000 } else { 20_000 };
    let mut csv = String::from("day,hr,bp_sys,bp_dia,spo2,ppco2,sleep_h,dose_usv
");
    for i in 0..csv_n {
        let day = (i % 78) + 1;
        let co2 = 2.2 + ((i % 25) as f64) * 0.12;
        let _ = writeln!(csv, "{day},{},{},{},97.4,{co2:.1},7.2,{}", 62 + (i % 30), 114 + (i % 26), 72 + (i % 16), 28 + (i % 400));
    }
    let t0 = Instant::now();
    let (csv_rows, _, skipped) = importer::parse_csv(&csv).unwrap();
    let dt_csv = t0.elapsed();
    assert_eq!(csv_rows.len(), csv_n);
    assert_eq!(skipped, 0);

    let json_n = if cfg!(debug_assertions) { 1_000 } else { 10_000 };
    let mut json = String::from("[");
    for i in 0..json_n {
        if i > 0 { json.push(','); }
        let day = (i % 78) + 1;
        let _ = write!(json, r#"{{"day":{day},"hr":88,"bp_sys":136,"bp_dia":84,"spo2":96.5,"ppco2":3.4,"sleep_h":5.8,"dose_usv":420,"mood":3,"stress":4,"tags":["fatigue"],"note":"Storm shelter prep and CO2 watch"}}"#);
    }
    json.push(']');
    let t1 = Instant::now();
    let (json_rows, _, jskipped) = importer::parse_json(&json).unwrap();
    let mut log = MissionLog { current_day: 78, entries: generate_sample_history() };
    let (mut w, mut ms) = (Vec::new(), 0);
    let (created, updated) = importer::merge_rows_into_log(&mut log, json_rows, &mut w, &mut ms);
    let dt_json = t1.elapsed();
    assert_eq!(jskipped, 0);
    assert!(created + updated > 0);
    let csv_mb = (csv.len() as f64 / (1024.0 * 1024.0)) / dt_csv.as_secs_f64().max(1e-9);
    let json_mb = (json.len() as f64 / (1024.0 * 1024.0)) / dt_json.as_secs_f64().max(1e-9);
    println!("[2/7] Importer CSV: {csv_n} rows in {:.2} ms ({:.0} rows/s, {:.1} MB/s) | JSON+Merge: {json_n} rows in {:.2} ms ({:.0} rows/s, {:.1} MB/s)", dt_csv.as_secs_f64() * 1e3, rate(csv_n, dt_csv), csv_mb, dt_json.as_secs_f64() * 1e3, rate(json_n, dt_json), json_mb);
}

#[test]
fn bench_03_bilingual_lexicon_nlp_throughput() {
    let notes = [
        "Solar particle event alarm: 4h in shelter, fatigue and headache but crew calm.",
        "Хорошо выспался, бодрое настроение, тренировка ARED прошла штатно.",
        "Тревога, буря, недосып и усталость, болит голова, конфликт в смене.",
        "Nominal CO2 scrubber maintenance complete; rested and focused before EVA.",
    ];
    let tags = vec!["fatigue".to_string(), "calm".to_string()];
    let n = if cfg!(debug_assertions) { 5_000 } else { 30_000 };
    let t0 = Instant::now();
    let mut hits = 0usize;
    for i in 0..n {
        let r = lexicon::analyze(Some(notes[i % notes.len()]), &tags);
        hits += black_box(r.themes.len());
    }
    let dt = t0.elapsed();
    assert!(hits >= n);
    println!("[3/7] EN/RU Lexicon NLP: {n} notes in {:.2} ms | {:.0} notes/s | {:.2} us/note", dt.as_secs_f64() * 1e3, rate(n, dt), dt.as_secs_f64() * 1e6 / n as f64);
}

#[test]
fn bench_04_clinical_scoring_and_latency_percentiles() {
    let batch = 100usize;
    let batches = if cfg!(debug_assertions) { 100 } else { 1_000 };
    let total = batch * batches;
    let mut lat_ns = Vec::with_capacity(batches);
    let mut crit = 0usize;
    let mut nom = 0usize;
    let t0 = Instant::now();
    for b in 0..batches {
        let bt = Instant::now();
        for j in 0..batch {
            let idx = b * batch + j;
            let j = (idx % 7) as f64;
            let e = match idx % 3 {
                0 => DayEntry { day: ((idx % 78) + 1) as u32, hr: Some(62.0 + j), bp_sys: Some(114.0 + j), bp_dia: Some(74.0 + j * 0.5), spo2: Some(97.5 + j * 0.1), ppco2: Some(2.2 + j * 0.05), sleep_hours: Some(7.2 + j * 0.1), dose_usv_h: Some(26.0 + j), mood: Some(4), ..Default::default() },
                1 => DayEntry { day: ((idx % 78) + 1) as u32, hr: Some(86.0 + j), bp_sys: Some(140.0 + j), bp_dia: Some(86.0 + j), spo2: Some(95.6 + j * 0.1), ppco2: Some(3.2 + j * 0.1), sleep_hours: Some(6.0 + j * 0.05), dose_usv_h: Some(210.0 + j * 10.0), mood: Some(3), ..Default::default() },
                _ => DayEntry { day: ((idx % 78) + 1) as u32, hr: Some(104.0 + j * 2.0), bp_sys: Some(152.0 + j * 2.0), bp_dia: Some(94.0 + j), spo2: Some(94.2 + j * 0.1), ppco2: Some(4.6 + j * 0.1), sleep_hours: Some(4.5 + j * 0.05), dose_usv_h: Some(1200.0 + j * 100.0), mood: Some(2), ..Default::default() },
            };
            let (lv, _, score, _, _) = compute_level_rank(black_box(&e));
            if lv == DayLevel::Critical { crit += 1; } else if lv == DayLevel::Nominal { nom += 1; }
            let _ = black_box(score);
        }
        lat_ns.push(bt.elapsed().as_nanos());
    }
    let dt = t0.elapsed();
    lat_ns.sort_unstable();
    let p50 = lat_ns[batches / 2] as f64 / batch as f64;
    let p95 = lat_ns[(batches * 95) / 100] as f64 / batch as f64;
    let p99 = lat_ns[(batches * 99) / 100] as f64 / batch as f64;
    assert!(crit > 0 && nom > 0);
    println!("[4/7] Clinical Scoring: {total} evals in {:.2} ms | {:.0} evals/s | p50={:.0} ns p95={:.0} ns p99={:.0} ns", dt.as_secs_f64() * 1e3, rate(total, dt), p50, p95, p99);
}

#[test]
fn bench_05_cohort_analytics_365_days() {
    let base = generate_sample_history();
    let mut year = Vec::with_capacity(365);
    for day in 1..=365u32 {
        let mut e = base[(day as usize - 1) % base.len()].clone();
        e.day = day;
        year.push(e);
    }
    let runs = if cfg!(debug_assertions) { 100 } else { 1_000 };
    let t0 = Instant::now();
    for _ in 0..runs {
        let res = analytics::compute_analytics(365, black_box(&year));
        assert_eq!(res.coverage.logged_days, 365);
        assert_eq!(res.correlations.len(), 3);
    }
    let dt = t0.elapsed();
    println!("[5/7] 365-Day Cohort Analytics: {runs} runs ({} entries) in {:.2} ms | {:.0} runs/s | {:.3} ms/run", runs * 365, dt.as_secs_f64() * 1e3, rate(runs, dt), dt.as_secs_f64() * 1e3 / runs as f64);
}

#[test]
fn bench_06_crew_roster_and_workout_ops() {
    let n = if cfg!(debug_assertions) { 2_000 } else { 20_000 };
    let rubio = crew_profile::rubio_reference_slot();
    let t0 = Instant::now();
    let mut kcal_sum = 0u64;
    for i in 0..n {
        let clean = crew_profile::sanitize_crew_slot(black_box(rubio.clone()));
        let mut store = workout_log::WorkoutLogStore::default();
        let summary = workout_log::op_seed_default_day(&mut store, ((i % 78) + 1) as u32).unwrap();
        kcal_sum += u64::from(summary.target_kcal + workout_log::compute_target_kcal(2.0));
        let _ = black_box(clean);
    }
    let dt = t0.elapsed();
    assert!(kcal_sum >= (n as u64) * 3435);
    println!("[6/7] Crew+Workout Ops: {n} cycles in {:.2} ms | {:.0} ops/s", dt.as_secs_f64() * 1e3, rate(n, dt));
}

#[test]
fn bench_07_multicore_parallel_stress() {
    let threads = std::thread::available_parallelism().map_or(4, |n| n.get().clamp(2, 12));
    let per_thread = if cfg!(debug_assertions) { 5_000 } else { 50_000 };
    let t0 = Instant::now();
    let total_ops: usize = std::thread::scope(|s| {
        let mut handles = Vec::with_capacity(threads);
        for tid in 0..threads {
            handles.push(s.spawn(move || {
                let tags = vec!["fatigue".to_string()];
                let mut acc = 0usize;
                for i in 0..per_thread {
                    let e = DayEntry {
                        day: (((tid + i) % 78) + 1) as u32,
                        hr: Some(64.0 + (i % 35) as f64),
                        ppco2: Some(2.4 + ((i % 22) as f64) * 0.1),
                        sleep_hours: Some(5.2 + (i % 4) as f64),
                        dose_usv_h: Some(40.0 + ((i % 10) as f64) * 50.0),
                        mood: Some(((i % 5) + 1) as u8),
                        ..Default::default()
                    };
                    let (_, _, score, _, _) = compute_level_rank(&e);
                    let lex = lexicon::analyze(Some("CO2 scrubber fatigue check and calm rest"), &tags);
                    acc += usize::from(score) + lex.themes.len();
                }
                let (_, bytes) = selena_lib::bench_telemetry_steps(250, true, false);
                let _ = black_box(acc + bytes);
                per_thread
            }));
        }
        handles.into_iter().map(|h| h.join().unwrap()).sum()
    });
    let dt = t0.elapsed();
    assert_eq!(total_ops, threads * per_thread);
    println!("[7/7] Multicore Stress ({threads} threads): {total_ops} mixed ops in {:.2} ms | {:.0} combined ops/s", dt.as_secs_f64() * 1e3, rate(total_ops, dt));
}
