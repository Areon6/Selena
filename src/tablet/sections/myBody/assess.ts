import type { BodyProfile, Level } from "../../../types";
import type { Basis } from "../../../sources";

export interface Factor {
  /** BodyZone id the factor relates to */
  zone: string;
  level: Level;
  /** key in TABLET_I18N[lang].body.factors */
  key: string;
  basis: Basis;
  /** ids from src/sources.ts */
  sources: string[];
}

/** NASA bone-changes risk page: crew height can increase by as much as 3 % in space. */
export const SPINE_GROWTH_MAX = 0.03;

/**
 * Profile-specific factors. Only factors with a NASA source live here.
 *
 * Removed on purpose (they were invented, with no NASA source behind the numbers):
 *  - BMI / body-fat / FFMI cut-offs ("underweight", "obesity", "lowFat", "lowLean", "highLean"),
 *  - "highBmr" (BMR >= 2000 kcal -> more CO2),
 *  - any sex-specific SANS factor: studies disagree and sex is confounded with body weight.
 * BMI, FFMI and resting energy are still shown in the tablet as plain information. They change no status.
 */
export function assessProfile(_p: BodyProfile): Factor[] {
  return [{ zone: "bones", level: "nominal", key: "spinal", basis: "nasa", sources: ["risk-bone"] }];
}