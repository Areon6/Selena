import type { BmiCategory, DaySource, Level, Sentiment, Sex } from "../types";
import type { Lang } from "../i18n";

/** Tablet texts live next to the tablet so a new section only touches this folder. English only (offline build). */
export interface TabletTexts {
  open: string;
  title: string;
  close: string;
  back: string;
  sections: Record<string, { title: string; desc: string; modules: Record<string, { title: string; desc: string }> }>;
  body: {
    sex: string;
    sexOpts: Record<Sex, string>;
    fields: Record<"heightCm" | "weightKg" | "bodyFatPct" | "muscularity" | "shoulderWidth" | "waist" | "hips", string>;
    derived: string;
    bmi: string;
    bsa: string;
    fatMass: string;
    leanMass: string;
    ffmi: string;
    bmr: string;
    energyRef: string;
    evaExtra: string;
    bmiNote: string;
    source: string;
    checked: string;
    categories: Record<BmiCategory, string>;
    apply: string;
    applying: string;
    cancel: string;
    defaults: string;
    saved: string;
    unsaved: string;
    hint: string;
    warnings: Record<string, string>;
    checkDirty: string;
    checkOverall: string;
    anthro: string;
    zonesTitle: string;
    noFactors: string;
    factors: Record<string, string>;
    checkDisclaimer: string;
  };
  checkin: {
    sleepHours: string;
    mood: string;
    systolic: string;
    diastolic: string;
    pulse: string;
    save: string;
    saving: string;
    last: string;
    none: string;
    justNow: string;
    ago: (min: number) => string;
    hint: string;
  };
  mindData: {
    tabs: { calendar: string; analytics: string; importReport: string };
    ranges: [string, string, string];
    dayShort: (d: number) => string;
    dayTitle: (d: number) => string;
    levels: Record<Level, string>;
    emptyLevel: string;
    sources: Record<DaySource, string>;
    calDisclaimer: string;
    resetSample: string;
    resetting: string;
    physioTitle: string;
    psychTitle: string;
    tagsTitle: string;
    themesTitle: string;
    sentimentTitle: string;
    noteTitle: string;
    notePlaceholder: string;
    physioOptional: string;
    noData: (d: number) => string;
    noSignalTitle: string;
    noSignalSub: (d: number) => string;
    noSignalStatus: string;
    btnBack: string;
    btnEdit: string;
    btnFill: string;
    btnSave: string;
    btnSaving: string;
    formSubtitle: string;
    mood: string;
    energy: string;
    stress: string;
    sleep: string;
    hr: string;
    bp: string;
    bpSys: string;
    bpDia: string;
    spo2: string;
    ppco2: string;
    doseRate: string;
    score: {
      title: string;
      subtitle: string;
      metrics: (n: number) => string;
      allClear: string;
      factors: Record<string, string>;
      basis: Record<"nasa" | "mixed" | "illustrative", string>;
      disclaimer: string;
    };
    tags: Record<string, string>;
    sentiments: Record<Sentiment, string>;
    themes: Record<string, string>;
    analytics: {
      loading: string;
      coverageTitle: string;
      loggedValue: (logged: number, total: number) => string;
      sampleTag: (n: number) => string;
      manualTag: (n: number) => string;
      checkinTag: (n: number) => string;
      importTag: (n: number) => string;
      avgMood: string;
      avgStress: string;
      avgSleep: string;
      volatility: string;
      sparkTitle: string;
      legend: { mood: string; stress: string; shift: string };
      noSeries: string;
      shiftsTitle: string;
      noShifts: string;
      shiftRow: (fromDay: number, toDay: number) => string;
      themesTitle: string;
      noThemes: string;
      sentimentTitle: string;
      corrTitle: string;
      corrCohortSample: (nA: number, nB: number) => string;
      corrInsufficient: string;
      corrPairs: Record<string, { title: string; cohorts: string }>;
      corrMetrics: Record<string, string>;
      basisIllustrative: string;
      disclaimer: string;
    };
    importView: {
      importTitle: string;
      importBadge: string;
      unitsHint: string;
      btnLoadSample: string;
      btnPickFile: string;
      placeholder: string;
      btnImport: string;
      btnImporting: string;
      btnClear: string;
      summary: (fmt: string, imp: number, upd: number, skip: number) => string;
      reportTitle: string;
      reportDelayBadge: (min: number) => string;
      formatMd: string;
      formatJson: string;
      btnCopy: string;
      btnCopied: string;
      btnExportMd: string;
      btnExportJson: string;
      savedTo: (path: string) => string;
      reportDisclaimer: string;
    };
    stubImport: string;
    nextStep: string;
    loading: string;
  };
}

export const TABLET_I18N: Record<Lang, TabletTexts> = {
  en: {
    open: "Tablet",
    title: "Tablet",
    close: "Close",
    back: "Back",
    sections: {
      myBody: {
        title: "My Body",
        desc: "Body parameters and condition check",
        modules: {
          enterParams: { title: "Enter parameters", desc: "Sex, height, weight, body fat and build — applied to the 3D model" },
          checkState: { title: "Check condition", desc: "Summary of body, zones and risks using your profile and telemetry" },
        },
      },
      checkIn: {
        title: "Check-in",
        desc: "Log sleep, mood and blood pressure",
        modules: {
          sleepMood: { title: "Sleep and mood", desc: "Hours slept and a 1–5 mood score" },
          bloodPressure: { title: "Blood pressure", desc: "Seated, at rest: pressure and pulse" },
        },
      },
      workout: {
        title: "Workout & Fuel",
        desc: "Countermeasure exercise log, nutrition and hydration",
        modules: {
          dayLog: { title: "Day log", desc: "ARED / cardio / mobility sessions, NASA energy target and hydration" },
        },
      },
      mindData: {
        title: "Mind & Data",
        desc: "Mission calendar from Day 1, crew log and data tools",
        modules: {
          calendar: { title: "Mission calendar", desc: "Browse Days 1–78, inspect daily status or log retroactive entries" },
          analytics: { title: "Mind & correlations", desc: "Mood volatility, thought themes and mind-body associations" },
          importReport: { title: "Import & report", desc: "CSV/JSON device ingestion and Houston micro-report" },
        },
      },
    },
    body: {
      sex: "Biological profile",
      sexOpts: { neutral: "Neutral", male: "Male", female: "Female" },
      fields: {
        heightCm: "Height",
        weightKg: "Weight",
        bodyFatPct: "Body fat",
        muscularity: "Muscularity",
        shoulderWidth: "Shoulder width",
        waist: "Waist",
        hips: "Hips",
      },
      derived: "Derived",
      bmi: "BMI",
      bsa: "Body surface area",
      fatMass: "Fat mass",
      leanMass: "Lean mass",
      ffmi: "Lean mass index",
      bmr: "Resting energy (est.)",
      energyRef: "Crew energy reference",
      evaExtra: "EVA extra energy",
      bmiNote: "BMI classes are standard clinical cut-offs, not NASA limits. Body metrics are informational and do not change any status.",
      source: "Source",
      checked: "Checked",
      categories: { under: "Underweight", normal: "Normal", over: "Overweight", obese1: "Obesity I", obese2: "Obesity II", obese3: "Obesity III" },
      apply: "Apply & save",
      applying: "Saving…",
      cancel: "Discard edits",
      defaults: "Defaults",
      saved: "Saved on board",
      unsaved: "Unsaved changes",
      hint: "Sliders preview instantly; the model is rebuilt when you release them. Weight and fat change soft tissue only — bones and organs follow height, sex, shoulders and hips.",
      warnings: {
        fatLowForBmi: "Very low body fat for this BMI. Check the values.",
        fatHighForBmi: "High body fat for this BMI. Check the values.",
        leanVeryHigh: "Lean mass index is unusually high.",
        leanVeryLow: "Lean mass index is unusually low.",
        muscleVsMass: "Muscularity does not match the lean mass.",
      },
      checkDirty: "You have unsaved edits. This check uses the saved profile.",
      checkOverall: "Overall",
      anthro: "Anthropometry",
      zonesTitle: "Zones · telemetry and profile",
      noFactors: "No profile-specific factors.",
      factors: {
        spinal: "Spinal elongation in microgravity: height can increase by up to 3% (about +{cm} cm for you). Re-check height and suit / seat fit.",
      },
      checkDisclaimer: "Not medical advice. Zone statuses mix NASA limits with illustrative thresholds, marked per zone.",
    },
    checkin: {
      sleepHours: "Hours slept",
      mood: "Mood",
      systolic: "Systolic",
      diastolic: "Diastolic",
      pulse: "Pulse",
      save: "Save entry",
      saving: "Saving…",
      last: "Last entry",
      none: "No entry yet",
      justNow: "just now",
      ago: (m) => `${m} min ago`,
      hint: "Live scenario session syncs into Day 78 of the mission log. Thresholds are illustrative.",
    },
    mindData: {
      tabs: { calendar: "Calendar", analytics: "Analytics", importReport: "Import" },
      ranges: ["Days 1–28", "Days 29–56", "Days 57–78"],
      dayShort: (d) => `D${String(d).padStart(2, "0")}`,
      dayTitle: (d) => `DAY ${String(d).padStart(2, "0")}`,
      levels: { nominal: "Nominal", watch: "Watch", critical: "Critical" },
      emptyLevel: "No data",
      sources: {
        sample: "Simulated sample history",
        checkin: "Crew Check-in",
        manual: "Manual log entry",
        import: "Device import",
      },
      calDisclaimer: "Days 1–77 are simulated sample history · Day rank A–D is an illustrative composite score",
      resetSample: "Reset log to sample",
      resetting: "Resetting…",
      physioTitle: "Physiological summary",
      psychTitle: "Psychological snapshot",
      tagsTitle: "Quick tags",
      themesTitle: "Detected themes",
      sentimentTitle: "Tone",
      noteTitle: "Crew notes",
      notePlaceholder: "Free-text thoughts, sleep notes or cabin observations…",
      physioOptional: "Physiological values (optional)",
      noData: (d) => `No telemetry or crew check-in logged for Day ${d}.`,
      noSignalTitle: "NO SIGNAL",
      noSignalSub: (d) => `NO DATA LOGGED FOR DAY ${String(d).padStart(2, "0")}`,
      noSignalStatus: "MISSION ARCHIVE",
      btnBack: "← Back",
      btnEdit: "Edit / add data",
      btnFill: "Log data for this date",
      btnSave: "Save entry",
      btnSaving: "Saving…",
      formSubtitle: "Retroactive or current mission day log",
      mood: "Mood",
      energy: "Energy",
      stress: "Stress",
      sleep: "Sleep",
      hr: "Heart rate",
      bp: "Blood pressure",
      bpSys: "BP Systolic",
      bpDia: "BP Diastolic",
      spo2: "SpO₂",
      ppco2: "ppCO₂",
      doseRate: "Dose rate",
      score: {
        title: "Score breakdown",
        subtitle: "Illustrative composite vs day targets",
        metrics: (n) => `${n}/10 metrics`,
        allClear: "All logged metrics within target bands",
        factors: {
          ppco2_crit: "ppCO₂ critical",
          ppco2_watch: "ppCO₂ elevated",
          spo2_crit: "SpO₂ critically low",
          spo2_watch: "SpO₂ low",
          hr_crit: "Heart rate critical",
          hr_watch: "Heart rate out of range",
          bp_sys_crit: "Systolic pressure critical",
          bp_sys_watch: "Systolic pressure high",
          bp_dia_crit: "Diastolic pressure critical",
          bp_dia_watch: "Diastolic pressure high",
          sleep_crit: "Sleep critically short",
          sleep_watch: "Short sleep",
          dose_crit: "Radiation dose rate critical",
          dose_watch: "Radiation dose rate elevated",
          stress_high: "Stress very high",
          stress_elevated: "Stress elevated",
          mood_low: "Mood very low",
          mood_sub: "Mood below baseline",
          energy_low: "Energy very low",
          incomplete_data: "Too few metrics logged (score capped)",
          level_cap_watch: "Watch day: score capped below rank A",
          level_cap_critical: "Critical day: score capped below rank B",
        },
        basis: { nasa: "NASA", mixed: "mixed", illustrative: "illustrative" },
        disclaimer: "Score and rank are illustrative, relative to on-board day target bands. Only ppCO₂ limits (NASA-STD-3001 / OCHMO-TB-004) and the 7.0 h sleep threshold (NASA Ames) follow published guidance.",
      },
      tags: {
        fatigue: "Fatigue",
        weakness: "Weakness",
        brain_fog: "Brain fog",
        poor_sleep: "Poor sleep",
        homesick: "Homesick / Family",
        cabin_stuffy: "Cabin stuffy",
        crew_tension: "Crew tension",
        calm: "Calm",
        focused: "Focused",
        motivated: "Motivated",
      },
      sentiments: {
        positive: "Positive",
        mixed: "Mixed",
        negative: "Negative",
        neutral: "Neutral",
      },
      themes: {
        isolation_family: "Isolation & family",
        fatigue_sleep: "Fatigue & sleep",
        cognitive_load: "Cognitive load",
        cabin_environment: "Cabin environment",
        crew_interpersonal: "Crew interpersonal",
        positive_recovery: "Positive recovery",
      },
      analytics: {
        loading: "Computing mission log analytics…",
        coverageTitle: "Archive & baseline",
        loggedValue: (logged, total) => `${logged} / ${total} days`,
        sampleTag: (n) => `${n} simulated`,
        manualTag: (n) => `${n} manual`,
        checkinTag: (n) => `${n} check-in`,
        importTag: (n) => `${n} import`,
        avgMood: "Mood",
        avgStress: "Stress",
        avgSleep: "Sleep",
        volatility: "Volatility σ",
        sparkTitle: "Mood & stress trajectory",
        legend: { mood: "Mood", stress: "Stress", shift: "Shift ≥ 2" },
        noSeries: "Not enough mood/stress points to plot trajectory.",
        shiftsTitle: "Sharp day-to-day shifts",
        noShifts: "No jumps with |ΔMood| ≥ 2 or |ΔStress| ≥ 2.",
        shiftRow: (fromDay, toDay) => `D${String(fromDay).padStart(2, "0")} → D${String(toDay).padStart(2, "0")}`,
        themesTitle: "Thought themes",
        noThemes: "No themes detected yet.",
        sentimentTitle: "Note tone",
        corrTitle: "Mind ↔ Body associations",
        corrCohortSample: (nA, nB) => `n = ${nA} vs ${nB}`,
        corrInsufficient: "Needs ≥ 3 logged days in each cohort.",
        corrPairs: {
          sleep_vs_mood: {
            title: "Short sleep vs ≥ 7.0 h",
            cohorts: "Sleep < 7.0 h vs ≥ 7.0 h (ames-sleep)",
          },
          co2_vs_cognition: {
            title: "Elevated ppCO₂ vs nominal",
            cohorts: "ppCO₂ ≥ 3.0 vs < 3.0 mmHg (NASA-STD-3001)",
          },
          stress_vs_sleep: {
            title: "High stress vs baseline",
            cohorts: "Stress ≥ 4/5 vs ≤ 3/5",
          },
        },
        corrMetrics: {
          mood: "Mood",
          stress: "Stress",
          fatigueCogPct: "Fatigue / fog",
          energy: "Energy",
          sleep: "Sleep",
          hr: "Heart rate",
        },
        basisIllustrative: "illustrative",
        disclaimer: "Days 1–77 include simulated sample history. Cohort deltas are illustrative associations (n ≥ 3), not causal claims.",
      },
      importView: {
        importTitle: "Device Telemetry Import",
        importBadge: "CSV / JSON",
        unitsHint: "Strict units: ppCO₂ in mmHg (never %), dose rate in µSv/h",
        btnLoadSample: "Load sample device export",
        btnPickFile: "Open .csv / .json",
        placeholder: "day,hr,bp_sys,bp_dia,spo2,ppco2,sleep_h,dose_usv\n73,67,120,76,97.5,2.4,7.4,40",
        btnImport: "Merge into mission log",
        btnImporting: "Importing…",
        btnClear: "Clear",
        summary: (fmt, imp, upd, skip) => `${fmt.toUpperCase()} merged: +${imp} new, ${upd} updated, ${skip} skipped`,
        reportTitle: "Houston Mission Micro-Report",
        reportDelayBadge: (min) => `${min} min one-way queue`,
        formatMd: "Markdown (.md)",
        formatJson: "JSON (.json)",
        btnCopy: "Copy",
        btnCopied: "Copied",
        btnExportMd: "Export .md",
        btnExportJson: "Export .json",
        savedTo: (path) => `Saved offline to: ${path}`,
        reportDisclaimer: "100% offline packet queued for delayed Earth link. Includes simulated Days 1–77 notice and illustrative basis tags.",
      },
      stubImport: "CSV/JSON device data import and Houston micro-report export will run here in Stage 4.",
      nextStep: "Coming in next stage",
      loading: "Loading mission archive…",
    },
  },
};
