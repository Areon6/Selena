/**
 * Source registry. The Rust backend emits source ids; the UI resolves them here.
 * Everything below was opened and read on `CHECKED`. Offline app: show URLs as plain text, not links.
 * `basis: "nasa"`  -> the number or name comes from the cited page.
 * `basis: "illustrative"` -> no NASA figure exists for it in the sources we read; label it as such in the UI.
 */
export type Basis = "nasa" | "illustrative";

export interface Source {
  title: string;
  url: string;
}

export const CHECKED = "2026-11-14";

export const SOURCES: Record<string, Source> = {
  // Hazards (https://www.nasa.gov/hrp/hazards/, updated 2026-06-12)
  "haz-radiation": { title: "NASA HRP · Hazard: Space Radiation", url: "https://www.nasa.gov/hrp/hazard-space-radiation/" },
  "haz-isolation": { title: "NASA HRP · Hazard: Isolation and Confinement", url: "https://www.nasa.gov/hrp/hazard-isolation-and-confinement/" },
  "haz-distance": { title: "NASA HRP · Hazard: Distance from Earth", url: "https://www.nasa.gov/hrp/hazard-distance-from-earth/" },
  "haz-gravity": { title: "NASA HRP · Hazard: Gravity Fields", url: "https://www.nasa.gov/hrp/hazard-gravity-fields/" },
  "haz-environment": { title: "NASA HRP · Hazard: Hostile/Closed Environments", url: "https://www.nasa.gov/hrp/hazard-hostile-closed-environments/" },

  // Risks (https://www.nasa.gov/hrp/risks/, updated 2026-07-21)
  "risk-bone": { title: "Risk of Spaceflight-Induced Bone Changes", url: "https://www.nasa.gov/reference/risk-of-spaceflight-induced-bone-changes/" },
  "risk-fitness": { title: "Risk of Reduced Cardiorespiratory and Musculoskeletal Fitness", url: "https://www.nasa.gov/reference/risk-of-reduced-cardiorespiratory-and-musculoskeletal-fitness/" },
  "risk-sans": { title: "Risk of Spaceflight Associated Neuro-ocular Syndrome (SANS)", url: "https://www.nasa.gov/reference/risk-of-spaceflight-associated-neuro-ocular-syndrome-sans/" },
  "risk-cardio": { title: "Risk of Cardiovascular Adaptations", url: "https://www.nasa.gov/reference/risk-of-cardiovascular-adaptations/" },
  "risk-sleep": { title: "Risk of Inadequate Sleep and Irregular Schedules", url: "https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/" },
  "risk-behavior": { title: "Risk of Behavioral Changes and Psychiatric Disorders", url: "https://www.nasa.gov/reference/risk-of-behavioral-conditions-and-psychiatric-disorders/" },
  "risk-cancer": { title: "Risk of Radiation-Induced Cancers", url: "https://www.nasa.gov/reference/risk-of-radiation-induced-cancers/" },
  "risk-hypoxia": { title: "Risk of Hypoxia", url: "https://www.nasa.gov/reference/risk-of-hypoxia/" },
  "risk-nutrition": { title: "Risk of Inadequate Food and Nutrition", url: "https://www.nasa.gov/reference/risk-of-inadequate-food-and-nutrition/" },

  // Numeric limits
  "std-co2": {
    title: "NASA-STD-3001 Vol 2 [V2 6004]: avg 1-hour ppCO2 in the habitable volume <= 3 mmHg",
    url: "https://www.nasa.gov/reference/6-0-natural-and-induced-environments-vol-2",
  },
  "tb-co2": {
    title: "OCHMO-TB-004 Carbon Dioxide: symptoms reported above 4.5 mmHg",
    url: "https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf",
  },
  "tb-radiation": {
    title: "OCHMO Radiation Protection brief: [V1 4030] career < 600 mSv, [V1 4031] SPE < 250 mSv",
    url: "https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf",
  },
};