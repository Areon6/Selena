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

// ─── Mission Log & Analytics (Mind & Data) ────────────────────────────────────

export type DaySource = "sample" | "checkin" | "manual" | "import";
export type DayRank = "A" | "B" | "C" | "D";
export type Sentiment = "positive" | "mixed" | "negative" | "neutral";

/** One line of the day-score breakdown. `key` is a stable ID localized in TABLET_I18N. */
export interface ScoreFactor {
  key: string;
  actual: string;
  target: string;
  delta: number;
  severity: Level;
  basis: "nasa" | "mixed" | "illustrative";
}

export interface DayEntry {
  day: number;
  source?: DaySource | null;

  hr?: number | null;
  bpSys?: number | null;
  bpDia?: number | null;
  spo2?: number | null;
  ppco2?: number | null;
  sleepHours?: number | null;
  doseUsvH?: number | null;

  mood?: number | null;
  energy?: number | null;
  stress?: number | null;
  tags?: string[] | null;
  note?: string | null;
  themes?: string[] | null;
  sentiment?: Sentiment | null;

  level?: Level | null;
  rank?: DayRank | null;
  score?: number | null;
  /** How many of the 10 scored fields are filled. */
  metricsCount?: number | null;
  scoreFactors?: ScoreFactor[] | null;
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

export interface AnalyticsCoverage {
  totalDays: number;
  loggedDays: number;
  sampleDays: number;
  manualDays: number;
  checkinDays: number;
  importDays: number;
  avgMood: number | null;
  avgEnergy: number | null;
  avgStress: number | null;
  avgSleep: number | null;
}

export interface MoodPoint {
  day: number;
  mood: number | null;
  energy: number | null;
  stress: number | null;
  level: Level;
  isShift: boolean;
}

export interface MoodShift {
  fromDay: number;
  toDay: number;
  deltaMood: number | null;
  deltaStress: number | null;
  fromMood: number | null;
  toMood: number | null;
  fromStress: number | null;
  toStress: number | null;
}

export interface ThemeCount {
  id: string;
  count: number;
  pct: number;
}

export interface SentimentCounts {
  positive: number;
  mixed: number;
  negative: number;
  neutral: number;
}

export interface CorrelationMetric {
  key: string;
  unit: string;
  cohortA: number;
  cohortB: number;
  delta: number;
  higherIsBad: boolean;
}

export interface CorrelationPair {
  id: string;
  nA: number;
  nB: number;
  available: boolean;
  basis: Basis;
  metric1: CorrelationMetric | null;
  metric2: CorrelationMetric | null;
}

export interface MindAnalytics {
  coverage: AnalyticsCoverage;
  moodVolatility: number | null;
  stressVolatility: number | null;
  series: MoodPoint[];
  shifts: MoodShift[];
  themes: ThemeCount[];
  sentiments: SentimentCounts;
  correlations: CorrelationPair[];
}