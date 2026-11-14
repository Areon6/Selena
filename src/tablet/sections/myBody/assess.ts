import type { BodyMetrics, BodyProfile, Level } from "../../../types";

export interface Factor {
  /** BodyZone id the factor relates to */
  zone: string;
  level: Level;
  /** key in TABLET_I18N[lang].body.factors */
  key: string;
}

export function bmiLevel(m: BodyMetrics): Level {
  if (m.bmi < 16 || m.bmi >= 40) return "critical";
  return m.bmiCategory === "normal" ? "nominal" : "watch";
}

/**
 * Heuristic, demo-grade profile factors. They never raise a zone to "critical" and are NOT a diagnosis:
 * thresholds are placeholders to be replaced by NASA-STD-3001 / flight-surgeon criteria.
 */
export function assessProfile(p: BodyProfile, m: BodyMetrics): Factor[] {
  const out: Factor[] = [];
  const fatHigh = p.sex === "female" ? 32 : p.sex === "male" ? 25 : 28;
  const fatLow = p.sex === "female" ? 14 : 8;
  const ffmiLow = p.sex === "female" ? 14 : p.sex === "male" ? 17 : 15.5;
  const ffmiHigh = p.sex === "female" ? 19 : 22;

  if (m.bmi < 18.5) out.push({ zone: "bones", level: "watch", key: "underweight" });
  if (m.bmi >= 30 || p.bodyFatPct >= fatHigh + 8) out.push({ zone: "heart", level: "watch", key: "obesity" });
  if (m.ffmi < ffmiLow) out.push({ zone: "bones", level: "watch", key: "lowLean" });
  if (m.ffmi >= ffmiHigh) out.push({ zone: "bones", level: "nominal", key: "highLean" });
  if (p.bodyFatPct < fatLow) out.push({ zone: "bones", level: "watch", key: "lowFat" });
  if (m.bmrKcal >= 2000) out.push({ zone: "lungs", level: "watch", key: "highBmr" });
  out.push({ zone: "bones", level: "nominal", key: "spinal" });
  return out;
}