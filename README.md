# SELENA

**SELENA** is a 100% offline autonomous on-board clinical decision support system (CDSS) designed for deep-space Mars transit scenarios (Day 78 of transit, 22-minute one-way Earth communication delay), built for **NASA Space Apps Challenge 2026**.

---

## Offline Architecture & Guarantees

SELENA operates completely self-contained with zero runtime dependencies on external infrastructure:
- **Zero network calls:** No external APIs, cloud telemetry, telemetry backends, local LLMs, or external font/CDN fetches.
- **Bundled typography:** `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono` (`.woff2` assets) are compiled directly into the local bundle.
- **Desktop runtime:** **Tauri v2** (`tauri`, `tauri-plugin-opener`, `serde`, `serde_json`, Rust `edition = 2024`) with a **React 19 + TypeScript + Vite** frontend and **Vanilla Three.js** 3D rendering.
- **Local persistence:** Mission history and daily check-ins are stored locally in `mission_log.json` inside the OS application data directory (`app_data_dir()`).

---

## Core Modules

- **Flight Deck & Environmental Simulation (`src-tauri/src/lib.rs`, `src/App.tsx`)**
  - Day 78 transit status with 22-minute one-way communication latency framing.
  - Interactive `ppCO₂` scrubber failure and recovery curves (strictly in **mmHg**), Solar Particle Event (SPE) radiation simulation (`µSv/h` and `mSv`), crew Check-in, and emergency response checklists.
- **3D Crew Anatomy Viewport (`src/components/BodyModelV3.tsx`, `bodyGeometries.ts`, `earthBackground.ts`)**
  - Interactive 6-zone anatomical model set against a deep-space Milky Way backdrop.
  - Live **`LiDAR | Holo`** render mode toggle: ~37.6k-point LiDAR constellation and double-sided Fresnel Holo mesh, driven dynamically by environmental hazards and physiology controls.
- **Mind & Data (`src-tauri/src/mission_log.rs`, `lexicon.rs`, `analytics.rs`, `src/tablet/sections/mindData/`)**
  - Interactive Days 1–78 mission calendar with retroactive logging (`DayForm`) and `NO SIGNAL` fallback for unlogged days.
  - Deterministic EN/RU journal lexicon parser (`lexicon.rs`) extracting themes and sentiment locally without LLMs.
  - Mind↔Body cohort analytics (`analytics.rs`) requiring `n >= 3` per cohort, reporting exact `nA vs nB` sample sizes and framing findings strictly as associations (no causal claims).
  - Transparent `0–100` daily health score (`score`, `rank` A–D, `score_factors`) with per-factor point attribution and explicit scientific basis tags.

---

## Scientific Grounding & Metric Honesty

All clinical thresholds and references are cataloged in `src/sources.ts` (verified `2026-11-14`) with explicit provenance (`basis: "nasa" | "mixed" | "illustrative"`):

- **Verified Numeric Limits (NASA / OCHMO / Ames)**
  - **CO₂ (`std-co2`):** `NASA-STD-3001 Vol 2 [V2 6004]` — 1-hour average habitable `ppCO₂ <= 3 mmHg` (`https://www.nasa.gov/reference/6-0-natural-and-induced-environments-vol-2`)
  - **CO₂ Symptoms (`tb-co2`):** `OCHMO-TB-004 Carbon Dioxide` — symptoms reported above `4.5 mmHg` (`https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf`)
  - **Sleep (`ames-sleep`):** `NASA Ames (Flynn-Evans et al.)` — consensus `>= 7 h` sleep; ISS crew averaged `7.33 h` (`https://humansystems.arc.nasa.gov/publications/Humans_Sufficient_Sleep_Microgravity.pdf`)
  - **Nutrition (`std-nutrition`):** `NASA-STD-3001 Vol 2 [V2 7003 / V2 7004]` — `3,035 kcal/day` average (`+200 kcal` per EVA hour) (`https://www.nasa.gov/reference/7-0-habit-ability-functions-vol-2/`)
  - **Radiation (`tb-radiation`):** `OCHMO Radiation Protection Brief [V1 4030 / V1 4031]` — career limit `< 600 mSv`, SPE limit `< 250 mSv` (`https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf`)
- **NASA HRP Hazards (`https://www.nasa.gov/hrp/hazards/`, updated `2026-06-12`):** Space Radiation, Isolation and Confinement, Distance from Earth, Gravity Fields, Hostile/Closed Environments.
- **NASA HRP Risks (`https://www.nasa.gov/hrp/risks/`, updated `2026-07-21`):** Bone Changes, Reduced Cardiorespiratory and Musculoskeletal Fitness, SANS, Cardiovascular Adaptations, Inadequate Sleep and Irregular Schedules, Behavioral Changes and Psychiatric Disorders, Radiation-Induced Cancers, Hypoxia, Inadequate Food and Nutrition.
- **Illustrative & Simulated Scope:** Days 1–77 are explicitly marked as **Simulated sample history**. Composite `0–100` daily scores, `A–D` ranks, secondary illustrative cutoffs (such as critical sleep `<= 5.0 h`), and Mind↔Body cohort correlations are explicitly labeled `mixed` or `illustrative` in the UI.

---

## Development & Build

### Prerequisites
- Node.js & npm
- Rust toolchain (`cargo`)
- Tauri v2 OS dependencies (WebKitGTK and build essentials on Linux)

### Commands

```bash
# Install frontend dependencies
npm install

# Run desktop app in development mode
npm run tauri dev

# Run Rust unit tests
cargo test --manifest-path src-tauri/Cargo.toml --lib

# Type-check TypeScript frontend
npx tsc --noEmit

# Build production desktop bundle
npm run tauri build
