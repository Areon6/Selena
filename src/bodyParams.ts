/**
 * Body profile → derived metrics → AnatomySpec.
 * Pure functions, no three.js: safe to unit-test and to call from React render.
 *
 * Reference mannequin (all soft-tissue deltas are 0 here): neutral, 181 cm, 78 kg, 18 % fat, muscularity 0.5.
 * Units of AnatomySpec: metres in the *reference* frame (before the global height scale).
 */
import type { BmiCategory, BodyMetrics, BodyProfile, Sex } from "./types";

export const REF_HEIGHT_M = 1.81;

type NumKey = Exclude<keyof BodyProfile, "sex">;

export const PROFILE_LIMITS: Record<NumKey, { min: number; max: number; step: number }> = {
  heightCm: { min: 140, max: 210, step: 1 },
  weightKg: { min: 40, max: 150, step: 0.5 },
  bodyFatPct: { min: 5, max: 50, step: 0.5 },
  muscularity: { min: 0, max: 1, step: 0.01 },
  shoulderWidth: { min: 0.85, max: 1.15, step: 0.01 },
  waist: { min: 0.85, max: 1.25, step: 0.01 },
  hips: { min: 0.85, max: 1.25, step: 0.01 },
};

export const DEFAULT_PROFILE: BodyProfile = {
  sex: "neutral",
  heightCm: 181,
  weightKg: 78,
  bodyFatPct: 18,
  muscularity: 0.5,
  shoulderWidth: 1,
  waist: 1,
  hips: 1,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Never trust external input: NaN / out-of-range / unknown sex fall back to safe values. */
export function clampProfile(p: Partial<BodyProfile> | null | undefined): BodyProfile {
  const src: Partial<BodyProfile> = p ?? {};
  const num = (k: NumKey): number => {
    const v = src[k];
    const L = PROFILE_LIMITS[k];
    return typeof v === "number" && Number.isFinite(v) ? clamp(v, L.min, L.max) : DEFAULT_PROFILE[k];
  };
  const sex: Sex =
    src.sex === "male" || src.sex === "female" || src.sex === "neutral" ? src.sex : DEFAULT_PROFILE.sex;
  return {
    sex,
    heightCm: num("heightCm"),
    weightKg: num("weightKg"),
    bodyFatPct: num("bodyFatPct"),
    muscularity: num("muscularity"),
    shoulderWidth: num("shoulderWidth"),
    waist: num("waist"),
    hips: num("hips"),
  };
}

/** Stable key for memoisation: two profiles with the same key build the same geometry. */
export function profileKey(p: BodyProfile): string {
  const c = clampProfile(p);
  return [
    c.sex,
    c.heightCm.toFixed(1),
    c.weightKg.toFixed(1),
    c.bodyFatPct.toFixed(1),
    c.muscularity.toFixed(2),
    c.shoulderWidth.toFixed(2),
    c.waist.toFixed(2),
    c.hips.toFixed(2),
  ].join("|");
}

/* ───────────────────────── metrics ───────────────────────── */

export function bmiCategory(bmi: number): BmiCategory {
  if (bmi < 18.5) return "under";
  if (bmi < 25) return "normal";
  if (bmi < 30) return "over";
  if (bmi < 35) return "obese1";
  if (bmi < 40) return "obese2";
  return "obese3";
}

export function computeMetrics(profile: BodyProfile): BodyMetrics {
  const p = clampProfile(profile);
  const h = p.heightCm / 100;
  const bmi = p.weightKg / (h * h);
  const fatMassKg = (p.weightKg * p.bodyFatPct) / 100;
  const leanMassKg = p.weightKg - fatMassKg;
  return {
    bmi,
    bmiCategory: bmiCategory(bmi),
    bsaMosteller: Math.sqrt((p.heightCm * p.weightKg) / 3600),
    bsaDuBois: 0.007184 * Math.pow(p.weightKg, 0.425) * Math.pow(p.heightCm, 0.725),
    fatMassKg,
    leanMassKg,
    ffmi: leanMassKg / (h * h),
    bmrKcal: 370 + 21.6 * leanMassKg,
  };
}

/** Keys of implausible combinations (resolved to text in the tablet i18n). */
export function plausibilityWarnings(profile: BodyProfile): string[] {
  const p = clampProfile(profile);
  const m = computeMetrics(p);
  const out: string[] = [];
  if (m.bmi >= 30 && p.bodyFatPct < 12) out.push("fatLowForBmi");
  if (m.bmi < 19 && p.bodyFatPct > 32) out.push("fatHighForBmi");
  if (m.ffmi > 26) out.push("leanVeryHigh");
  if (m.ffmi < 13) out.push("leanVeryLow");
  if (p.muscularity > 0.85 && m.ffmi < 18) out.push("muscleVsMass");
  if (p.muscularity < 0.15 && m.ffmi > 23) out.push("muscleVsMass");
  return [...new Set(out)];
}

/* ───────────────────────── anatomy spec ───────────────────────── */

export interface SoftTissue {
  /** Radial thickness (m) added to the reference mannequin. Negative = leaner than reference. */
  neck: number;
  chest: number;
  chestDepth: number;
  waist: number;
  waistDepth: number;
  hip: number;
  hipDepth: number;
  shoulder: number;
  upperArm: number;
  forearm: number;
  thigh: number;
  calf: number;
  /** 0 = none; female profile only */
  bust: number;
}

export interface AnatomySpec {
  heightM: number;
  /** global scale: lateral / depth */
  sx: number;
  /** global scale: vertical (feet stay on y = 0) */
  sy: number;
  sex: Sex;
  /* skeletal frame (does NOT depend on weight / fat) */
  shoulderDx: number;
  ribX: number;
  ribZ: number;
  pelvisW: number;
  /** lateral shift of the hip joint (m) */
  hipDx: number;
  /* soft tissue (shell only) */
  soft: SoftTissue;
}

const FAT_IDX_REF = 4.286; // 78 kg · 18 % / 1.81²
const LEAN_IDX_REF = 19.52; // 63.96 kg / 1.81²

const SEX_FRAME: Record<Sex, { shoulderDx: number; ribX: number; ribZ: number; pelvisW: number; waistA: number; hipA: number }> = {
  neutral: { shoulderDx: 0, ribX: 1, ribZ: 1, pelvisW: 1, waistA: 0, hipA: 0 },
  male: { shoulderDx: 0.012, ribX: 1.04, ribZ: 1.03, pelvisW: 0.97, waistA: 0.005, hipA: -0.008 },
  female: { shoulderDx: -0.016, ribX: 0.93, ribZ: 0.95, pelvisW: 1.09, waistA: -0.012, hipA: 0.018 },
};

/** Where fat is deposited. */
const SEX_FAT: Record<Sex, { chest: number; belly: number; hip: number; arm: number; thigh: number; calf: number }> = {
  neutral: { chest: 1, belly: 1, hip: 1, arm: 1, thigh: 1, calf: 1 },
  male: { chest: 1, belly: 1.25, hip: 0.8, arm: 0.9, thigh: 0.8, calf: 0.95 },
  female: { chest: 1.1, belly: 0.85, hip: 1.3, arm: 1.05, thigh: 1.4, calf: 1 },
};

/** How strongly muscularity shows. */
const SEX_MUSCLE: Record<Sex, { chest: number; shoulder: number; limb: number; neck: number }> = {
  neutral: { chest: 0.8, shoulder: 0.8, limb: 0.8, neck: 0.8 },
  male: { chest: 1, shoulder: 1, limb: 1, neck: 1 },
  female: { chest: 0.55, shoulder: 0.6, limb: 0.65, neck: 0.5 },
};

/** Smooth asymmetric saturation: |x| can never exceed lo (negative side) or hi (positive side). */
const sat = (x: number, lo: number, hi: number) =>
  x >= 0 ? hi * Math.tanh(x / hi) : -lo * Math.tanh(-x / lo);

export function deriveAnatomy(profile: BodyProfile): AnatomySpec {
  const p = clampProfile(profile);
  const h = p.heightCm / 100;
  const fatMass = (p.weightKg * p.bodyFatPct) / 100;
  const lean = p.weightKg - fatMass;

  const fi = fatMass / (h * h) - FAT_IDX_REF; // + = fatter than reference
  const li = lean / (h * h) - LEAN_IDX_REF; // + = more lean mass than reference
  const mus = p.muscularity - 0.5;

  const F = SEX_FRAME[p.sex];
  const D = SEX_FAT[p.sex];
  const M = SEX_MUSCLE[p.sex];

  const sy = h / REF_HEIGHT_M;
  const pelvisW = F.pelvisW * (1 + (p.hips - 1) * 0.25);

  const soft: SoftTissue = {
    neck: sat(0.0025 * fi + 0.0015 * li + 0.012 * mus * M.neck, 0.01, 0.03),
    chest: sat(0.0055 * fi * D.chest + 0.004 * li + 0.05 * mus * M.chest, 0.035, 0.075),
    chestDepth: sat(0.0045 * fi * D.chest + 0.003 * li + 0.035 * mus * M.chest, 0.03, 0.06),
    waist:
      sat(0.0085 * fi * D.belly + 0.003 * li, 0.05, 0.12) + F.waistA + (p.waist - 1) * 0.15,
    waistDepth: sat(0.01 * fi * D.belly + 0.002 * li, 0.045, 0.13) + (p.waist - 1) * 0.1,
    hip:
      sat(0.007 * fi * D.hip + 0.0035 * li + 0.02 * mus * M.limb, 0.04, 0.1) + F.hipA + (p.hips - 1) * 0.16,
    hipDepth: sat(0.0055 * fi * D.hip + 0.003 * li, 0.04, 0.09) + (p.hips - 1) * 0.12,
    shoulder: sat(0.002 * fi + 0.002 * li + 0.04 * mus * M.shoulder, 0.015, 0.035),
    upperArm: sat(0.003 * fi * D.arm + 0.002 * li + 0.035 * mus * M.limb, 0.012, 0.04),
    forearm: Math.max(0, sat(0.0012 * fi + 0.0015 * li + 0.015 * mus * M.limb, 0.001, 0.02)),
    thigh: sat(0.006 * fi * D.thigh + 0.0035 * li + 0.03 * mus * M.limb, 0.012, 0.06),
    calf: sat(0.003 * fi * D.calf + 0.0025 * li + 0.028 * mus * M.limb, 0.012, 0.035),
    bust: p.sex === "female" ? clamp(0.6 + 0.06 * (fi + FAT_IDX_REF), 0.5, 1.6) : 0,
  };

  return {
    heightM: h,
    sx: Math.pow(sy, 0.65),
    sy,
    sex: p.sex,
    shoulderDx: (p.shoulderWidth - 1) * 0.22 + F.shoulderDx,
    ribX: F.ribX * (1 + (p.shoulderWidth - 1) * 0.5),
    ribZ: F.ribZ,
    pelvisW,
    hipDx: 0.088 * (pelvisW - 1),
    soft,
  };
}

export const DEFAULT_SPEC: AnatomySpec = deriveAnatomy(DEFAULT_PROFILE);

/**
 * Cheap slider preview: a non-uniform scale of the already-built point cloud.
 * Heights are exact, girth is a rough uniform-in-XZ estimate. The exact geometry follows on release.
 */
export function previewScale(built: AnatomySpec, draft: AnatomySpec): [number, number, number] {
  const girth = (s: AnatomySpec) => 1 + (s.soft.chest + s.soft.waist + s.soft.hip) / 3 / 0.17;
  const sy = draft.sy / built.sy;
  const sxz = clamp((draft.sx / built.sx) * (girth(draft) / girth(built)), 0.5, 1.8);
  return [sxz, sy, sxz];
}