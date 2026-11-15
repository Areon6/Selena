# SELENA — 7-Slide Pitch Outline

1. **Slide 1 — Problem: Deep-Space Medical Autonomy (Day 78, 22-Min Delay)**
   - On Mars transit Day 78, one-way Earth communication takes **22 minutes** (44 minutes round-trip).
   - Ground flight surgeons cannot guide acute cabin or crew events in real time (`haz-distance`).
   - Crew need deterministic, zero-latency onboard Clinical Decision Support (CDSS) that works with zero ground connectivity.

2. **Slide 2 — Solution: 100% Offline Architecture**
   - **SELENA** runs completely self-contained on desktop (**Tauri v2 + Rust edition 2024 + React 19 + Vanilla Three.js**).
   - Zero cloud APIs, zero external font/CDN requests (`@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono` bundled locally), and zero heavy local LLMs.
   - All crew logs, device imports, and profiles persist locally via atomic JSON writes in `app_data_dir()`.

3. **Slide 3 — Live Flight Deck & Environmental Hazard Simulation**
   - Real-time cabin `ppCO₂` scrubber failure and recovery curves strictly in **mmHg** (never `%`): `2.4 mmHg` baseline, `3.0 mmHg` Watch (`NASA-STD-3001 Vol 2 [V2 6004]`), `4.5 mmHg` Critical (`OCHMO-TB-004`), `5.2 mmHg` plateau.
   - Solar Particle Event (SPE) radiation simulation in **`µSv/h`** (dose rate) and **`mSv`** (cumulative vs `< 600 mSv` career / `< 250 mSv` SPE limits per `OCHMO [V1 4030 / V1 4031]`).
   - Immediate onboard Check-in (sleep, mood, blood pressure) and emergency checklists.

4. **Slide 4 — 3D Bio-Twin Anatomy Viewport (`LiDAR | Holo`)**
   - Interactive 6-zone anatomical model (`brain`, `eyes`, `heart`, `lungs`, `bones`, `radiation`) against a deep-space Milky Way backdrop.
   - Live **`LiDAR | Holo`** render toggle (~37.6k-point LiDAR constellation and double-sided Fresnel Holo mesh), adapting dynamically to crew anthropometry (`body_profile.json`) and active hazards.

5. **Slide 5 — Mind & Data: Longitudinal Archive & Deterministic Analytics**
   - Days 1–78 mission calendar with `NO SIGNAL` fallback for unlogged dates and retroactive `DayForm` entry.
   - Deterministic bilingual (**EN/RU**) lexicon parser (`lexicon.rs`) extracting themes and sentiment without LLMs.
   - Transparent `0–100` daily score (`A–D` rank, `score_factors`) and Mind↔Body cohort analytics requiring `n >= 3` per cohort (`nA vs nB` displayed, strictly framed as non-causal associations).

6. **Slide 6 — Crew Onboarding, Countermeasures & Field Interoperability**
   - Crew onboarding & physiological baseline (`crew_profile.json`) plus offline **Workout & Nutrition Diary** (`workout_log.json`): ARED/Cardio/Mobility protocols (`workoutBasis: "illustrative"`) paired with `NASA-STD-3001 Vol 2 [V2 7003 / V2 7004]` energy targets (`3,035 kcal/day + 200 kcal per EVA hour`, `kcalBasis: "nasa"`).
   - Strict CSV/JSON device importer (`ppCO₂` in `mmHg`, dose in `µSv/h`) and offline **Houston Micro-Report** (`.md` / `.json`) queued for the 22-minute Earth link.

7. **Slide 7 — Scientific Honesty & Judge Readiness**
   - Every threshold in `src/sources.ts` (verified `2026-11-14`) carries explicit provenance: `basis: "nasa" | "mixed" | "illustrative"`.
   - Days 1–77 are explicitly marked **Simulated sample history**; ranks `A–D` and cohort correlations are explicitly labeled **illustrative**.
   - Deterministic Rust unit-test suite and clean offline desktop bundle ready for Linux, macOS, and Windows.