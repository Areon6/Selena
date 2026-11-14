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
  id: "solar" | "co2";
  title: string;
  summary: string;
  steps: string[];
}

export interface Scenarios {
  solarActive: boolean;
  co2FailureActive: boolean;
  co2Restoring: boolean;
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
  alerts: Alert[];
  scenarios: Scenarios;
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

// ─── Mission Log (Mind & Data) ────────────────────────────────────────────────

export type DaySource = "sample" | "checkin" | "manual" | "import";
export type DayRank = "A" | "B" | "C" | "D";

export interface DayEntry {
  day: number;
  source?: DaySource;

  hr?: number;
  bpSys?: number;
  bpDia?: number;
  spo2?: number;
  ppco2?: number;
  sleepHours?: number;
  doseUsvH?: number;

  mood?: number;
  energy?: number;
  stress?: number;
  tags?: string[];
  note?: string;
  themes?: string[];

  level?: Level;
  rank?: DayRank;
}

export interface MissionLog {
  currentDay: number;
  entries: DayEntry[];
}

export type LogMap = Map<number, DayEntry>;

export function buildLogMap(log: MissionLog): LogMap {
  const m = new Map<number, DayEntry>();
  for (const e of log.entries) m.set(e.day, e);
  return m;
}