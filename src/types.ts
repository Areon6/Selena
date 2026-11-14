import type { Basis } from "./sources";

export type Level = "nominal" | "watch" | "critical";

export interface Vitals {
  heartRateBpm: number;
  systolicMmhg: number;
  diastolicMmhg: number;
  spo2Pct: number;
  bodyTempC: number;
  sleepHours: number | null;
  moodScore: number | null;
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

export interface SleepLog {
  hours: number;
  mood: number;
  agoS: number;
}

export interface BpLog {
  systolic: number;
  diastolic: number;
  pulse: number;
  agoS: number;
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
  lastSleep: SleepLog | null;
  lastBp: BpLog | null;
}

export type Sex = "neutral" | "male" | "female";

export type BmiCategory = "under" | "normal" | "over" | "obese1" | "obese2" | "obese3";

export interface BodyProfile {
  sex: Sex;
  heightCm: number;
  weightKg: number;
  bodyFatPct: number;
  muscularity: number;
  shoulderWidth: number;
  waist: number;
  hips: number;
}

export interface BodyMetrics {
  bmi: number;
  bmiCategory: BmiCategory;
  bsaMosteller: number;
  bsaDuBois: number;
  fatMassKg: number;
  leanMassKg: number;
  ffmi: number;
  bmrKcal: number;
}