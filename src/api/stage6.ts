/**
 * Stage 6 IPC client — crew_profile.rs (7-slot roster + baselines) + workout_log.rs.
 * Command names and camelCase argument keys match the Rust side exactly.
 * Outside Tauri (plain browser / vite dev) every call falls back to localStorage emulation.
 */
import { invoke } from "@tauri-apps/api/core";
import type { Sex } from "../types";

/* ───────────────────────── types ───────────────────────── */

export const MAX_CREW_SLOTS = 7;

export interface CrewProfile {
  onboarded: boolean;
  walkthroughCompleted: boolean;
  callsign: string;
  fullName: string;
  role: string;
  ageYears: number;
  baselineHrBpm: number;
  baselineSysMmhg: number;
  baselineDiaMmhg: number;
  defaultEvaHours: number;
}

export interface CrewBodyBaseline {
  sex: Sex;
  heightCm: number;
  weightKg: number;
  bodyFatPct: number;
  muscularity: number;
  shoulderWidth: number;
  waist: number;
  hips: number;
}

export interface CrewSlot {
  id: string;
  presetKind: "nasa-reference" | "custom";
  missionBio: string;
  sourceId: string;
  crew: CrewProfile;
  body: CrewBodyBaseline;
}

export interface CrewRoster {
  activeId: string;
  maxSlots: number;
  slots: CrewSlot[];
}

export type ExerciseCategory = "ared" | "cardio" | "mobility";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack" | "hydration";

export interface ExercisePreset {
  id: string;
  name: string;
  category: ExerciseCategory;
  defaultMinutes: number;
  defaultSets: number | null;
  defaultReps: number | null;
  targetSystem: string;
  basis: "illustrative";
}

export interface WorkoutEntry {
  id: string;
  day: number;
  presetId: string;
  name: string;
  category: ExerciseCategory;
  minutes: number;
  sets: number | null;
  reps: number | null;
  loadKg: number | null;
  done: boolean;
  note: string | null;
}

export interface NutritionEntry {
  id: string;
  day: number;
  mealType: MealType;
  label: string;
  kcal: number;
  proteinG: number | null;
  waterMl: number | null;
}

export interface WorkoutDaySummary {
  day: number;
  totalExerciseMin: number;
  completedSessions: number;
  totalSessions: number;
  totalKcal: number;
  targetKcal: number;
  evaHours: number;
  totalWaterMl: number;
  kcalBasis: "nasa";
  workoutBasis: "illustrative";
  workouts: WorkoutEntry[];
  meals: NutritionEntry[];
}

/** NASA-STD-3001 Vol 2 [V2 7003]: 3,035 kcal/day; [V2 7004]: +200 kcal per EVA hour. */
export const BASE_KCAL = 3035;
export const KCAL_PER_EVA_HOUR = 200;
export const targetKcalFor = (evaHours: number): number => BASE_KCAL + KCAL_PER_EVA_HOUR * evaHours;

/** NASA-STD-3001 Vol 2 [V2 6109]: min 2,500 mL/day; [V2 11030]: +240 mL per EVA hour. */
export const BASE_WATER_ML = 2500;
export const WATER_ML_PER_EVA_HOUR = 240;
export const targetWaterMlFor = (evaHours: number): number =>
  Math.round(BASE_WATER_ML + WATER_ML_PER_EVA_HOUR * evaHours);

export const DEFAULT_CREW_PROFILE: CrewProfile = {
  onboarded: false,
  walkthroughCompleted: false,
  callsign: "",
  fullName: "",
  role: "Flight Engineer",
  ageYears: 36,
  baselineHrBpm: 66,
  baselineSysMmhg: 118,
  baselineDiaMmhg: 76,
  defaultEvaHours: 0,
};

export const DEFAULT_CREW_ROSTER: CrewRoster = {
  activeId: "slot-rubio",
  maxSlots: MAX_CREW_SLOTS,
  slots: [
    {
      id: "slot-rubio",
      presetKind: "nasa-reference",
      missionBio:
        'Col. Francisco "Frank" Rubio, M.D. · 371-day U.S. single-spaceflight ISS record (Exp 67/68/69), board-certified flight surgeon, Artemis III. Public NASA bio; clinical vitals & 3D parameters are illustrative defaults.',
      sourceId: "bio-rubio",
      crew: {
        onboarded: false,
        walkthroughCompleted: false,
        callsign: "RUBIO-68",
        fullName: 'Francisco "Frank" Rubio',
        role: "Crew Medical Officer",
        ageYears: 50,
        baselineHrBpm: 62,
        baselineSysMmhg: 116,
        baselineDiaMmhg: 74,
        defaultEvaHours: 0,
      },
      body: {
        sex: "male",
        heightCm: 178,
        weightKg: 79,
        bodyFatPct: 15,
        muscularity: 0.62,
        shoulderWidth: 1.04,
        waist: 0.96,
        hips: 0.98,
      },
    },
    {
      id: "slot-koch",
      presetKind: "nasa-reference",
      missionBio:
        "Christina Hammock Koch · 328-day woman's single-spaceflight ISS record (Exp 59/60/61), first all-female spacewalk, Artemis II mission specialist. Public NASA bio; clinical vitals & 3D parameters are illustrative defaults.",
      sourceId: "bio-koch",
      crew: {
        onboarded: false,
        walkthroughCompleted: false,
        callsign: "KOCH-59",
        fullName: "Christina Hammock Koch",
        role: "Flight Engineer",
        ageYears: 47,
        baselineHrBpm: 60,
        baselineSysMmhg: 114,
        baselineDiaMmhg: 72,
        defaultEvaHours: 0,
      },
      body: {
        sex: "female",
        heightCm: 167,
        weightKg: 61,
        bodyFatPct: 19,
        muscularity: 0.55,
        shoulderWidth: 0.94,
        waist: 0.9,
        hips: 1.0,
      },
    },
  ],
};

/* ───────────────────────── environment ───────────────────────── */

const inTauri = (): boolean =>
  typeof window !== "undefined" &&
  Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* offline fallback ignores storage quota errors */
  }
}

/* ───────────────────────── crew roster ───────────────────────── */

const ROSTER_KEY = "selena.stage6.roster.v1";

function cloneDefaultRoster(): CrewRoster {
  return JSON.parse(JSON.stringify(DEFAULT_CREW_ROSTER)) as CrewRoster;
}

function readLocalRoster(): CrewRoster {
  const stored = readLS<CrewRoster | null>(ROSTER_KEY, null);
  if (!stored || !Array.isArray(stored.slots) || stored.slots.length === 0) {
    const fresh = cloneDefaultRoster();
    writeLS(ROSTER_KEY, fresh);
    return fresh;
  }
  return stored;
}

export async function getCrewProfile(): Promise<CrewProfile> {
  if (inTauri()) return invoke<CrewProfile>("get_crew_profile");
  const r = readLocalRoster();
  return (r.slots.find((s) => s.id === r.activeId) ?? r.slots[0]).crew;
}

export async function saveCrewProfile(profile: CrewProfile): Promise<CrewProfile> {
  if (inTauri()) return invoke<CrewProfile>("save_crew_profile", { profile });
  const r = readLocalRoster();
  const idx = r.slots.findIndex((s) => s.id === r.activeId);
  const targetIdx = idx >= 0 ? idx : 0;
  r.slots[targetIdx].crew = profile;
  writeLS(ROSTER_KEY, r);
  return profile;
}

export async function resetCrewProfile(): Promise<CrewProfile> {
  if (inTauri()) return invoke<CrewProfile>("reset_crew_profile");
  const fresh = cloneDefaultRoster();
  writeLS(ROSTER_KEY, fresh);
  return fresh.slots[0].crew;
}

export async function getCrewRoster(): Promise<CrewRoster> {
  if (inTauri()) return invoke<CrewRoster>("get_crew_roster");
  return readLocalRoster();
}

export async function selectCrewSlot(id: string): Promise<CrewRoster> {
  if (inTauri()) return invoke<CrewRoster>("select_crew_slot", { id });
  const r = readLocalRoster();
  if (r.slots.some((s) => s.id === id)) r.activeId = id;
  writeLS(ROSTER_KEY, r);
  return r;
}

export async function saveCrewSlot(slot: CrewSlot): Promise<CrewRoster> {
  if (inTauri()) return invoke<CrewRoster>("save_crew_slot", { slot });
  const r = readLocalRoster();
  const next = { ...slot };
  if (!next.id) next.id = `slot-crew-${Date.now().toString(36)}`;
  const idx = r.slots.findIndex((s) => s.id === next.id);
  if (idx >= 0) {
    r.slots[idx] = next;
  } else {
    if (r.slots.length >= MAX_CREW_SLOTS) {
      throw new Error(`Crew roster limit reached (${MAX_CREW_SLOTS} slots max).`);
    }
    r.slots.push(next);
  }
  r.activeId = next.id;
  writeLS(ROSTER_KEY, r);
  return r;
}

export async function deleteCrewSlot(id: string): Promise<CrewRoster> {
  if (inTauri()) return invoke<CrewRoster>("delete_crew_slot", { id });
  const r = readLocalRoster();
  if (r.slots.length <= 1) throw new Error("At least 1 crew profile must remain on board.");
  r.slots = r.slots.filter((s) => s.id !== id);
  if (r.activeId === id) r.activeId = r.slots[0].id;
  writeLS(ROSTER_KEY, r);
  return r;
}

/* ───────────────────────── workout: local emulation ───────────────────────── */

const CATALOG: ExercisePreset[] = [
  { id: "ared_squat", name: "ARED Back Squat", category: "ared", defaultMinutes: 15, defaultSets: 4, defaultReps: 8, targetSystem: "Lower-body bone & hip/femoral loading", basis: "illustrative" },
  { id: "ared_deadlift", name: "ARED Deadlift", category: "ared", defaultMinutes: 15, defaultSets: 4, defaultReps: 8, targetSystem: "Posterior chain, lumbar spine & pelvis", basis: "illustrative" },
  { id: "ared_heel_raise", name: "ARED Heel Raises", category: "ared", defaultMinutes: 10, defaultSets: 3, defaultReps: 15, targetSystem: "Soleus, gastrocnemius & calcaneal bone", basis: "illustrative" },
  { id: "ared_press_row", name: "ARED Chest Press & Row", category: "ared", defaultMinutes: 15, defaultSets: 3, defaultReps: 10, targetSystem: "Upper-body & scapular strength", basis: "illustrative" },
  { id: "t2_treadmill", name: "T2 Treadmill Intervals", category: "cardio", defaultMinutes: 30, defaultSets: 5, defaultReps: null, targetSystem: "Cardiorespiratory endurance & tibial impact", basis: "illustrative" },
  { id: "cevis_cycle", name: "CEVIS Cycle Ergometer", category: "cardio", defaultMinutes: 25, defaultSets: null, defaultReps: null, targetSystem: "Aerobic capacity & VO2 maintenance", basis: "illustrative" },
  { id: "core_lumbar_decomp", name: "Core & Lumbar Decompression", category: "mobility", defaultMinutes: 12, defaultSets: 3, defaultReps: 12, targetSystem: "Spinal elongation comfort & trunk stability", basis: "illustrative" },
  { id: "cervical_fluid_mobility", name: "Cervical & Fluid Shift Mobility", category: "mobility", defaultMinutes: 10, defaultSets: 2, defaultReps: 10, targetSystem: "Neck mobility & headward fluid adaptation", basis: "illustrative" },
];

const DEFAULT_PROTOCOL = ["ared_squat", "ared_heel_raise", "t2_treadmill", "core_lumbar_decomp"];

interface DayStore {
  evaHours: number;
  workouts: WorkoutEntry[];
  meals: NutritionEntry[];
}

const dayKey = (day: number) => `selena.stage6.workout.${day}`;
const loadDay = (day: number): DayStore => ({
  evaHours: 0,
  workouts: [],
  meals: [],
  ...readLS<Partial<DayStore>>(dayKey(day), {}),
});
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function summarize(day: number, s: DayStore): WorkoutDaySummary {
  return {
    day,
    totalExerciseMin: s.workouts.reduce((a, w) => a + w.minutes, 0),
    completedSessions: s.workouts.filter((w) => w.done).length,
    totalSessions: s.workouts.length,
    totalKcal: s.meals.reduce((a, m) => a + m.kcal, 0),
    targetKcal: targetKcalFor(s.evaHours),
    evaHours: s.evaHours,
    totalWaterMl: s.meals.reduce((a, m) => a + (m.waterMl ?? 0), 0),
    kcalBasis: "nasa",
    workoutBasis: "illustrative",
    workouts: s.workouts,
    meals: s.meals,
  };
}

function mutate(day: number, fn: (s: DayStore) => void): WorkoutDaySummary {
  const s = loadDay(day);
  fn(s);
  writeLS(dayKey(day), s);
  return summarize(day, s);
}

/* ───────────────────────── workout: public API ───────────────────────── */

export async function getExerciseCatalog(): Promise<ExercisePreset[]> {
  if (inTauri()) return invoke<ExercisePreset[]>("get_exercise_catalog");
  return CATALOG;
}

export async function getWorkoutDay(day: number): Promise<WorkoutDaySummary> {
  if (inTauri()) return invoke<WorkoutDaySummary>("get_workout_day", { day });
  return summarize(day, loadDay(day));
}

export async function seedDefaultWorkoutDay(day: number): Promise<WorkoutDaySummary> {
  if (inTauri()) return invoke<WorkoutDaySummary>("seed_default_workout_day", { day });
  return mutate(day, (s) => {
    if (s.workouts.length > 0) return;
    s.workouts = DEFAULT_PROTOCOL.map((id) => {
      const p = CATALOG.find((c) => c.id === id) as ExercisePreset;
      return {
        id: uid("w"),
        day,
        presetId: p.id,
        name: p.name,
        category: p.category,
        minutes: p.defaultMinutes,
        sets: p.defaultSets,
        reps: p.defaultReps,
        loadKg: null,
        done: false,
        note: null,
      };
    });
  });
}

export interface AddWorkoutArgs {
  day: number;
  presetId: string;
  name: string;
  category: ExerciseCategory;
  minutes: number;
  sets: number | null;
  reps: number | null;
  loadKg: number | null;
  note: string | null;
}

export async function addWorkoutEntry(a: AddWorkoutArgs): Promise<WorkoutDaySummary> {
  if (inTauri()) {
    return invoke<WorkoutDaySummary>("add_workout_entry", {
      day: a.day,
      presetId: a.presetId,
      name: a.name,
      category: a.category,
      minutes: a.minutes,
      sets: a.sets,
      reps: a.reps,
      loadKg: a.loadKg,
      note: a.note,
    });
  }
  return mutate(a.day, (s) => {
    s.workouts.push({
      id: uid("w"),
      day: a.day,
      presetId: a.presetId,
      name: a.name,
      category: a.category,
      minutes: a.minutes,
      sets: a.sets,
      reps: a.reps,
      loadKg: a.loadKg,
      done: false,
      note: a.note,
    });
  });
}

export async function toggleWorkoutEntry(day: number, entryId: string): Promise<WorkoutDaySummary> {
  if (inTauri()) return invoke<WorkoutDaySummary>("toggle_workout_entry", { day, entryId });
  return mutate(day, (s) => {
    const w = s.workouts.find((x) => x.id === entryId);
    if (w) w.done = !w.done;
  });
}

export async function deleteWorkoutEntry(day: number, entryId: string): Promise<WorkoutDaySummary> {
  if (inTauri()) return invoke<WorkoutDaySummary>("delete_workout_entry", { day, entryId });
  return mutate(day, (s) => {
    s.workouts = s.workouts.filter((x) => x.id !== entryId);
  });
}

export interface AddNutritionArgs {
  day: number;
  mealType: MealType;
  label: string;
  kcal: number;
  proteinG: number | null;
  waterMl: number | null;
}

export async function addNutritionEntry(a: AddNutritionArgs): Promise<WorkoutDaySummary> {
  if (inTauri()) {
    return invoke<WorkoutDaySummary>("add_nutrition_entry", {
      day: a.day,
      mealType: a.mealType,
      label: a.label,
      kcal: a.kcal,
      proteinG: a.proteinG,
      waterMl: a.waterMl,
    });
  }
  return mutate(a.day, (s) => {
    s.meals.push({
      id: uid("n"),
      day: a.day,
      mealType: a.mealType,
      label: a.label,
      kcal: a.kcal,
      proteinG: a.proteinG,
      waterMl: a.waterMl,
    });
  });
}

export async function deleteNutritionEntry(day: number, entryId: string): Promise<WorkoutDaySummary> {
  if (inTauri()) return invoke<WorkoutDaySummary>("delete_nutrition_entry", { day, entryId });
  return mutate(day, (s) => {
    s.meals = s.meals.filter((x) => x.id !== entryId);
  });
}

export async function setDayEvaHours(day: number, evaHours: number): Promise<WorkoutDaySummary> {
  if (inTauri()) return invoke<WorkoutDaySummary>("set_day_eva_hours", { day, evaHours });
  return mutate(day, (s) => {
    s.evaHours = evaHours;
  });
}