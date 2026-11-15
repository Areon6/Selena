# References

Sources of the standards, clinical thresholds, methods and scientific statements used in SELENA. Each method entry names where in the code it is applied, maps to source IDs in `src/sources.ts` (last checked: `CHECKED = "2026-11-15"`) and separates NASA-based limits from simulated or illustrative heuristics.

## Standards and reference data

| Source ID | Standard or source | Identifier / Section | Address | Used for |
| --- | --- | --- | --- | --- |
| std-co2 | NASA-STD-3001 Vol 2, Section 6.0: Natural and Induced Environments | [V2 6004] | https://www.nasa.gov/reference/6-0-natural-and-induced-environments-vol-2/ | 1-hour average habitable ppCO₂ <= 3 mmHg |
| tb-co2 | NASA OCHMO Technical Brief: Carbon Dioxide | OCHMO-TB-004 | https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf | ppCO₂ > 4.5 mmHg symptom threshold |
| ames-sleep | NASA HRP: Risk from Inadequate Sleep and Irregular Schedules (incl. Flynn-Evans et al., NASA Ames) | HRP Sleep Risk | https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/ | consensus >= 7 h sleep target; ISS crew averaged 7.33 h |
| std-nutrition | NASA-STD-3001 Vol 2: Human Factors, Habitability, and Environmental Health | [V2 7003], [V2 7004] | https://standards.nasa.gov/standard/nasa/nasa-std-3001_vol_2 | 3,035 kcal/day average energy target; +200 kcal per EVA hour |
| std-hydration | NASA-STD-3001 Vol 2: Human Factors, Habitability, and Environmental Health | [V2 6109], [V2 11030] | https://standards.nasa.gov/standard/nasa/nasa-std-3001_vol_2 | minimum 2.5 L/day (2,500 mL/day) potable water; +240 mL/h EVA suited hydration |
| n/a | NASA-STD-3001 Vol 2, Section 7.0: Habitability Functions | Section 7.0 | https://www.nasa.gov/reference/7-0-habit-ability-functions-vol-2/ | habitability and crew life-support background |
| tb-radiation | NASA OCHMO Radiation Protection Technical Brief | [V1 4030], [V1 4031] | https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf | career radiation limit < 600 mSv; Solar Particle Event (SPE) limit < 250 mSv |
| mars-dra5 | NASA Human Exploration of Mars DRA 5.0 | baseline mission reference | https://www.nasa.gov/humans-in-space/humans-to-mars/ | baseline 6-crew Mars transit, 30-month mission, 22-minute one-way delay (ISS expedition max: 7) |
| bio-rubio | NASA Astronaut Biography: Francisco "Frank" Rubio, M.D. | ISS Exp 67/68/69 (371 d), Artemis III | https://www.nasa.gov/humans-in-space/astronauts/ | preset for the crew roster |
| bio-koch | NASA Astronaut Biography: Christina Hammock Koch | ISS Exp 59/60/61 (328 d), Artemis II | https://www.nasa.gov/humans-in-space/astronauts/ | preset for the crew roster |
| haz-* | NASA Human Research Program (HRP) Hazards | updated 2026-06-12 | https://www.nasa.gov/hrp/hazards/ | five spaceflight hazard categories (haz-radiation, haz-isolation, haz-distance, haz-gravity, haz-environment) |
| risk-* | NASA Human Research Program (HRP) Risks | updated 2026-07-21 | https://www.nasa.gov/hrp/risks/ | nine physiological and behavioral spaceflight risks (risk-bone through risk-nutrition) |
| n/a | Local mission and check-in store (`mission_log.json`) | Days 1-78 (offline JSON) | OS `app_data_dir()` | simulated sample history (Days 1-77) and user daily check-ins (Day 78+) |

Primary standards and documents:

- NASA (2023). NASA Space Flight Human-System Standard, Volume 2: Human Factors, Habitability, and Environmental Health (NASA-STD-3001 Vol 2). https://standards.nasa.gov/standard/nasa/nasa-std-3001_vol_2
- NASA Office of the Chief Health and Medical Officer (2023). Carbon Dioxide (OCHMO-TB-004). https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf
- NASA Office of the Chief Health and Medical Officer (2023). Radiation Protection Technical Brief. https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf
- NASA Human Research Program (HRP). Risk from Inadequate Sleep and Irregular Schedules (referencing Flynn-Evans, E., et al., NASA Ames Research Center). https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/

## Services and APIs

SELENA is an offline on-board clinical decision support system (CDSS) for deep-space transit without real-time Earth support. It makes no network calls at runtime.

| Component | Runtime target / Location | Used for |
| --- | --- | --- |
| External network APIs, cloud telemetry, remote LLMs, and CDNs | None | not used; scoring, parsing and analytics all run locally on the device |
| Local OS application data directory (`app_data_dir()`) | Local filesystem (`mission_log.json`) | offline storage of mission history, crew profiles, workouts and daily check-ins |
| Bundled fonts (`@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`) | Local Vite bundle (`.woff2`) | UI fonts built into the desktop bundle |
| Source registry (`src/sources.ts`) | Static TypeScript registry (`CHECKED = "2026-11-15"`) | maps source IDs from the Rust backend (`selena_lib`) to plain-text URLs and titles in the UI |

## Methods

### Source resolution and metric provenance (`src/sources.ts`, `src/types.ts`, `src/i18n.ts`)

- The Rust backend emits source IDs from `SOURCES`, and the frontend looks up titles and plain-text URLs in `src/sources.ts`. URLs are shown as plain text, not links, so the app works offline.
- Every threshold, metric and UI statement has a `Basis` tag (`"nasa" | "mixed" | "illustrative"`):
  - `nasa`: the value or taxonomy comes straight from the cited NASA standard or HRP page.
  - `mixed`: a NASA citation combined with an application-level heuristic or illustrative threshold.
  - `illustrative`: no NASA figure exists in the reviewed sources; the UI labels it as illustrative.

### Environmental hazard simulation (`src-tauri/src/lib.rs`, `src/App.tsx`, `src/api/`, `src/hooks/`)

- Interactive ppCO₂ scrubber failure and recovery curves, modeled in mmHg only and checked against `std-co2` (<= 3 mmHg) and `tb-co2` (> 4.5 mmHg).
- Solar Particle Event (SPE) radiation simulation that tracks dose rate (µSv/h) and cumulative exposure (mSv) against the `tb-radiation` limits (< 600 mSv career, < 250 mSv SPE).
- Crew check-in flow and emergency checklists built around Day 78 of the Mars transit and a 22-minute one-way communication delay with Earth.

### Daily health scoring and mission log (`src-tauri/src/mission_log.rs`, `src/tablet/sections/mindData/`)

- Calendar for Days 1-78 with retroactive logging (`DayForm`) and a `NO SIGNAL` fallback for days without an entry.
- Daily health score from 0 to 100 (`score`), A-D rank (`rank`) and points per factor (`score_factors`), each with a basis tag.
- Days 1-77 are marked as *Simulated sample history*; secondary thresholds (such as critical sleep <= 5.0 h) are tagged `illustrative` or `mixed`.

### Journal lexicon analysis (`lexicon.rs` in `src-tauri/src/`, `src/tablet/sections/mindData/`)

- Rule-based EN / RU lexicon parser that pulls behavioral themes and sentiment from journal entries on the device, with no local or cloud LLMs.

### Mind-body cohort analytics (`analytics.rs` in `src-tauri/src/`, `src/tablet/sections/mindData/`)

- Cohort comparisons need at least `n >= 3` per group and report the exact `nA` and `nB` counts.
- Links between journal themes and physiological metrics are presented as observational associations, not causal claims.

### Workout and nutrition tracking (`workout_log.rs` in `src-tauri/src/`, `src/tablet/sections/workout/`)

- Logs resistive (ARED) and cardiovascular sessions together with daily energy and fluid intake, and compares them with `std-nutrition` (3,035 kcal/day, +200 kcal/EVA hr) and `std-hydration` (2,500 mL/day, +240 mL/EVA hr).

### Crew roster and onboarding (`crew_profile.rs` in `src-tauri/src/`, `WelcomeScreen.tsx`)

- Up to 7 saved crew slots (the ISS expedition maximum; the Mars DRA 5.0 baseline is 6, `mars-dra5`) with `bio-rubio` and `bio-koch` presets, synced with live vitals and the 3D body viewport.

### 3D anatomical viewport (`src/bodyParams.ts`, `src/components/BodyModelV3.tsx`, `bodyGeometries.ts`, `earthBackground.ts`)

- Interactive 6-zone anatomical model on a deep-space Milky Way backdrop, built with plain Three.js and `src/bodyParams.ts`.
- LiDAR / Holo render toggle: a LiDAR constellation of about 37.6k points and a double-sided Fresnel Holo mesh, both driven by environmental hazards and physiological controls.

## Scientific context of statements in the interface

### NASA HRP 5 Spaceflight Hazards (`haz-*`)

- `haz-radiation`: Space Radiation, https://www.nasa.gov/hrp/hazard-space-radiation/
- `haz-isolation`: Isolation and Confinement, https://www.nasa.gov/hrp/hazard-isolation-and-confinement/
- `haz-distance`: Distance from Earth, https://www.nasa.gov/hrp/hazard-distance-from-earth/
- `haz-gravity`: Gravity Fields, https://www.nasa.gov/hrp/hazard-gravity-fields/
- `haz-environment`: Hostile/Closed Environments, https://www.nasa.gov/hrp/hazard-hostile-closed-environments/

### NASA HRP Clinical Risks (`risk-*`)

- `risk-bone`: Risk of Spaceflight-Induced Bone Changes, https://www.nasa.gov/reference/risk-of-spaceflight-induced-bone-changes/
- `risk-fitness`: Risk of Reduced Cardiorespiratory and Musculoskeletal Fitness, https://www.nasa.gov/reference/risk-of-reduced-cardiorespiratory-and-musculoskeletal-fitness/
- `risk-sans`: Risk of Spaceflight Associated Neuro-ocular Syndrome (SANS), https://www.nasa.gov/reference/risk-of-spaceflight-associated-neuro-ocular-syndrome-sans/
- `risk-cardio`: Risk of Cardiovascular Adaptations, https://www.nasa.gov/reference/risk-of-cardiovascular-adaptations/
- `risk-sleep`: Risk of Inadequate Sleep and Irregular Schedules, https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/
- `risk-behavior`: Risk of Behavioral Changes and Psychiatric Disorders, https://www.nasa.gov/reference/risk-of-behavioral-changes-and-psychiatric-disorders/
- `risk-cancer`: Risk of Radiation-Induced Cancers, https://www.nasa.gov/reference/risk-of-radiation-induced-cancers/
- `risk-hypoxia`: Risk of Hypoxia, https://www.nasa.gov/reference/risk-of-hypoxia/
- `risk-nutrition`: Risk of Inadequate Food and Nutrition, https://www.nasa.gov/reference/risk-of-inadequate-food-and-nutrition/

### Clinical vs. illustrative statements

- The numeric limits for environment, radiation, sleep, nutrition and hydration (`std-co2`, `tb-co2`, `ames-sleep`, `std-nutrition`, `std-hydration`, `tb-radiation`) and the crew and mission baselines (`mars-dra5`, `bio-rubio`, `bio-koch`) come straight from the NASA documents listed above (`basis: "nasa"`).
- The composite 0-100 daily scores, A-D ranks, secondary cutoffs (e.g., critical sleep <= 5.0 h), Days 1-77 sample history (*Simulated sample history*) and Mind-Body cohort associations are non-diagnostic heuristics. They are tagged `mixed` or `illustrative` in `src/sources.ts` and in the UI.

## Software

- Rust / desktop runtime (`src-tauri/Cargo.toml`, crate `selena` / `selena_lib`, edition 2024): `tauri` (2), `tauri-plugin-opener` (2), `serde` (1, feature `derive`), `serde_json` (1), build dependency `tauri-build` (2). Unit tests are in `src-tauri/tests/`, capabilities are set in `src-tauri/capabilities/` and `src-tauri/tauri.conf.json`.
- Browser / frontend (`package.json`): `react` (^19.1.0), `react-dom` (^19.1.0), `three` (^0.187.0), `@tauri-apps/api` (^2), `@tauri-apps/plugin-opener` (^2), `@fontsource/ibm-plex-sans` (^5.3.0), `@fontsource/ibm-plex-mono` (^5.3.0), `typescript` (~6.0.3), `vite` (^8.0.16), `@vitejs/plugin-react` (^6.0.2), `@tauri-apps/cli` (^2).
- Exact versions, scripts and build instructions are in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` and `README.md`.
