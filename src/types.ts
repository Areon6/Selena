import type { Basis } from "./sources";

export type Level = "nominal" | "watch" | "critical";

export interface Vitals {
  heartRateBpm: number;
  systolicMmhg: number;
  diastolicMmhg: number;
  spo2Pct: number;
  bodyTempC: number;
  sleepHours: number;
  moodScore: number;
}

export interface Environment {
  co2Mmhg: number;
  doseRateUsvH: number;
  cumulativeDoseMsv: number;
}

export interface BodyZone {
  id: string;
  name: string;
  level: Level;
  metric: string;
  note: string;
  sources: string[];
  basis: Basis;
}

export interface HazardStatus {
  id: string;
  name: string;
  level: Level;
  value: string;
  detail: string;
  sources: string[];
  basis: Basis;
}

export interface Task {
  id: string;
  title: string;
  detail: string;
  category: string;
  minutes: number;
  done: boolean;
}

export interface Alert {
  title: string;
  summary: string;
  steps: string[];
}

export interface HealthReport {
  missionDay: number;
  commsDelayMin: number;
  autonomous: boolean;
  level: Level;
  alert: Alert | null;
  vitals: Vitals;
  environment: Environment;
  zones: BodyZone[];
  hazards: HazardStatus[];
  tasks: Task[];
}

/* ───────────── Body profile (mirrors `BodyProfile` in src-tauri/src/profile.rs) ───────────── */

/** Biological profile that drives skeleton / torso proportions. `neutral` = the original mannequin. */
export type Sex = "neutral" | "male" | "female";

export interface BodyProfile {
  sex: Sex;
  heightCm: number;
  weightKg: number;
  bodyFatPct: number;
  /** 0..1, 0.5 = reference mannequin */
  muscularity: number;
  /** multiplier, 1 = reference */
  shoulderWidth: number;
  /** multiplier, 1 = reference */
  waist: number;
  /** multiplier, 1 = reference */
  hips: number;
}

export type BmiCategory = "under" | "normal" | "over" | "obese1" | "obese2" | "obese3";

export interface BodyMetrics {
  bmi: number;
  bmiCategory: BmiCategory;
  /** Mosteller, m² */
  bsaMosteller: number;
  /** Du Bois, m² */
  bsaDuBois: number;
  fatMassKg: number;
  leanMassKg: number;
  /** lean mass / height² */
  ffmi: number;
  /** Katch–McArdle resting energy estimate, kcal/day */
  bmrKcal: number;
}