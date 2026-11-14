export type Basis = "nasa" | "mixed" | "illustrative";

export interface SourceRef {
  label: string;
  url: string;
}

export const CHECKED = "2026-11-14";

export const SOURCES: Record<string, SourceRef> = {
  "haz-radiation": {
    label: "NASA HRP · Space Radiation",
    url: "https://www.nasa.gov/hrp/hazards/",
  },
  "haz-isolation": {
    label: "NASA HRP · Isolation and Confinement",
    url: "https://www.nasa.gov/hrp/hazards/",
  },
  "haz-distance": {
    label: "NASA HRP · Distance from Earth",
    url: "https://www.nasa.gov/hrp/hazards/",
  },
  "haz-gravity": {
    label: "NASA HRP · Gravity Fields",
    url: "https://www.nasa.gov/hrp/hazards/",
  },
  "haz-environment": {
    label: "NASA HRP · Hostile/Closed Environments",
    url: "https://www.nasa.gov/hrp/hazards/",
  },
  "std-co2": {
    label: "NASA-STD-3001 Vol 2 [V2 6004] · ppCO₂ ≤ 3.0 mmHg (1-h avg)",
    url: "https://www.nasa.gov/reference/nasa-std-3001/",
  },
  "tb-co2": {
    label: "OCHMO-TB-004 · CO₂ symptoms > 4.5 mmHg",
    url: "https://www.nasa.gov/ochmo/",
  },
  "tb-radiation": {
    label: "NASA-STD-3001 Vol 1 [V1 4030/4031] & OCHMO-TB-020 · Career < 600 mSv, SPE < 250 mSv",
    url: "https://www.nasa.gov/ochmo/",
  },
  "risk-sleep": {
    label: "NASA HRP · Sleep & Circadian Schedules",
    url: "https://humanresearchroadmap.nasa.gov/risks/",
  },
  "risk-behavior": {
    label: "NASA HRP · Behavioral Medicine",
    url: "https://humanresearchroadmap.nasa.gov/risks/",
  },
  "risk-sans": {
    label: "NASA HRP · Spaceflight Associated Neuro-ocular Syndrome (SANS)",
    url: "https://humanresearchroadmap.nasa.gov/risks/",
  },
  "risk-cardio": {
    label: "NASA HRP · Cardiovascular Adaptations",
    url: "https://humanresearchroadmap.nasa.gov/risks/",
  },
  "risk-hypoxia": {
    label: "NASA HRP · Hypoxia",
    url: "https://humanresearchroadmap.nasa.gov/risks/",
  },
  "risk-bone": {
    label: "NASA HRP · Bone Loss & Fracture",
    url: "https://humanresearchroadmap.nasa.gov/risks/",
  },
  "risk-fitness": {
    label: "NASA HRP · Impaired Muscle & Fitness",
    url: "https://humanresearchroadmap.nasa.gov/risks/",
  },
  "risk-cancer": {
    label: "NASA HRP · Radiation Carcinogenesis",
    url: "https://humanresearchroadmap.nasa.gov/risks/",
  },
};