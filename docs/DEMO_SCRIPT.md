# SELENA — 90-Second Live Demo Script

**Goal:** Show an end-to-end 100% offline workflow across Flight Deck, 3D Bio-Twin, Device Import, Analytics, and Countermeasures in 90 seconds.

---

### 0:00–0:15 — Crew Onboarding & Offline Flight Deck (Day 78)
1. Launch SELENA (or open **Crew Onboarding** if uninitialized).
2. Point out the **Day 78** mission header and **22 min one-way comms delay** — emphasize that everything runs locally with zero internet or cloud dependencies.
3. Confirm or save the crew baseline (`callsign`, `role`, resting `HR/BP`, default EVA hours) into `crew_profile.json`.

### 0:15–0:35 — 3D Bio-Twin (`LiDAR | Holo`) & Live Hazard Response
1. In the center 3D viewport, click the **`LiDAR | Holo`** render toggle to switch between the ~37.6k-point LiDAR constellation and the Fresnel Holo mesh.
2. Trigger **CO₂ scrubber failure** (or **Solar particle event**) on the Flight Deck:
   - Watch `ppCO₂` climb past **`3.0 mmHg`** (`Watch`, `NASA-STD-3001 V2 6004`) and **`4.5 mmHg`** (`Critical`, `OCHMO-TB-004`).
   - Show the **`lungs`** (or **`radiation`**) 3D zone highlight and the immediate onboard emergency checklist.
3. Click **Restore scrubber** / **Reset** to return to nominal baseline.

### 0:35–0:65 — Mind & Data: Device Import (`samples/`) + Houston Micro-Report
1. Click **Tablet → Mind & Data → Import**.
2. Click **Open .csv / .json** and select `samples/demo_co2_sleep_watch.csv` (or `samples/demo_spe_radiation.json` for an SPE + stress-note scenario).
3. Click **Merge into mission log** and show the merge summary (`imported / updated / skipped` with strict `mmHg` & `µSv/h` enforcement).
4. Switch to **Calendar** → open **Day 76** (`Device import` badge) to show the transparent `score_factors` breakdown and extracted `lexicon.rs` themes/sentiment.
5. Switch to **Analytics** → highlight the updated `import` cohort count and Mind↔Body `nA vs nB` associations (`illustrative`, non-causal).
6. Return to **Import**, toggle **Houston Mission Micro-Report** (`Markdown` / `JSON`), and click **Export .md** to queue an offline packet for the 22-minute Earth link.

### 0:65–0:90 — Workout & Fuel Countermeasures
1. Open **Tablet → Workout & Fuel**.
2. Click **Seed default day** to populate ARED, Cardio, and Mobility protocols (`workoutBasis: "illustrative"`), and check off one completed ARED session.
3. Set **EVA hours** to `2.0 h` and point out the energy target updating from **`3,035 kcal/day`** to **`3,435 kcal/day`** (`3035 + 200 × 2.0`, `kcalBasis: "nasa"` per `NASA-STD-3001 Vol 2 [V2 7003 / V2 7004]`).
4. Add a quick hydration/meal entry (e.g., `500 ml` water, `650 kcal`) to close out the daily crew loop.