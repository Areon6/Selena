import { useCallback, useEffect, useRef, useState } from "react";
import type { ModuleProps } from "../../types";
import { CHECKED, SOURCES } from "../../../sources";
import {
  BASE_KCAL,
  BASE_WATER_ML,
  KCAL_PER_EVA_HOUR,
  WATER_ML_PER_EVA_HOUR,
  addNutritionEntry,
  addWorkoutEntry,
  deleteNutritionEntry,
  deleteWorkoutEntry,
  getExerciseCatalog,
  getWorkoutDay,
  seedDefaultWorkoutDay,
  setDayEvaHours,
  targetWaterMlFor,
  toggleWorkoutEntry,
  type ExerciseCategory,
  type ExercisePreset,
  type MealType,
  type WorkoutDaySummary,
} from "../../../api/stage6";
import "./workout.css";

const MAX_DAY = 78;
const CATEGORY_LABEL: Record<ExerciseCategory, string> = { ared: "ARED", cardio: "Cardio", mobility: "Mobility" };
const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack", "hydration"];
const MEAL_LABEL: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  hydration: "Hydration",
};

interface QuickItem {
  label: string;
  mealType: MealType;
  kcal: number;
  proteinG: number | null;
  waterMl: number | null;
  hint: string;
}

/** Nominal logging shortcuts (editable via the custom form). Not a nutrition standard. */
const QUICK: QuickItem[] = [
  { label: "Thermostabilized Ration", mealType: "lunch", kcal: 700, proteinG: 28, waterMl: null, hint: "700 kcal · 28 g P" },
  { label: "Protein Recovery", mealType: "snack", kcal: 250, proteinG: 30, waterMl: null, hint: "250 kcal · 30 g P" },
  { label: "Hydration Pouch 500ml", mealType: "hydration", kcal: 0, proteinG: null, waterMl: 500, hint: "500 ml" },
  { label: "Electrolyte Pack", mealType: "hydration", kcal: 0, proteinG: null, waterMl: 250, hint: "250 ml" },
];

const toNum = (s: string): number => parseFloat(s.replace(",", "."));
const optNum = (s: string): number | null => {
  const t = s.trim();
  if (t === "") return null;
  const n = toNum(t);
  return Number.isFinite(n) ? n : NaN;
};
const inRange = (v: number, lo: number, hi: number) => Number.isFinite(v) && v >= lo && v <= hi;
const optInRange = (v: number | null, lo: number, hi: number) => v === null || inRange(v, lo, hi);
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

const SEGMENTS = 20;

export function WorkoutDayLog({ report }: ModuleProps) {
  const missionDay = Math.min(MAX_DAY, Math.max(1, Math.round(report.missionDay)));
  const [day, setDay] = useState(missionDay);
  const [dayText, setDayText] = useState(String(missionDay));
  const [summary, setSummary] = useState<WorkoutDaySummary | null>(null);
  const [catalog, setCatalog] = useState<ExercisePreset[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // exercise form
  const [presetId, setPresetId] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ExerciseCategory>("ared");
  const [minutes, setMinutes] = useState("20");
  const [sets, setSets] = useState("");
  const [reps, setReps] = useState("");
  const [loadKg, setLoadKg] = useState("");
  const [note, setNote] = useState("");

  // nutrition form
  const [mealType, setMealType] = useState<MealType>("snack");
  const [label, setLabel] = useState("");
  const [kcal, setKcal] = useState("");
  const [proteinG, setProteinG] = useState("");
  const [waterMl, setWaterMl] = useState("");
  const [evaText, setEvaText] = useState("0");

  const reqId = useRef(0);

  const adopt = useCallback((s: WorkoutDaySummary) => {
    setSummary(s);
    setEvaText(String(s.evaHours));
  }, []);

  const run = useCallback(
    async (fn: () => Promise<WorkoutDaySummary>): Promise<boolean> => {
      const id = ++reqId.current;
      setBusy(true);
      setErr(null);
      try {
        const s = await fn();
        if (id === reqId.current) adopt(s);
        return true;
      } catch (e) {
        if (id === reqId.current) setErr(String(e));
        return false;
      } finally {
        if (id === reqId.current) setBusy(false);
      }
    },
    [adopt],
  );

  useEffect(() => {
    let alive = true;
    getExerciseCatalog()
      .then((c) => alive && setCatalog(c))
      .catch((e) => alive && setErr(String(e)));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    void run(() => getWorkoutDay(day));
  }, [day, run]);

  const goDay = (d: number) => {
    const c = Math.min(MAX_DAY, Math.max(1, Math.round(d)));
    setDay(c);
    setDayText(String(c));
  };

  const pickPreset = (id: string) => {
    setPresetId(id);
    const p = catalog.find((c) => c.id === id);
    if (!p) return;
    setName(p.name);
    setCategory(p.category);
    setMinutes(String(p.defaultMinutes));
    setSets(p.defaultSets != null ? String(p.defaultSets) : "");
    setReps(p.defaultReps != null ? String(p.defaultReps) : "");
  };

  const min = toNum(minutes);
  const setsV = optNum(sets);
  const repsV = optNum(reps);
  const loadV = optNum(loadKg);
  const exerciseValid =
    name.trim().length > 0 &&
    inRange(min, 1, 240) &&
    Number.isInteger(min) &&
    optInRange(setsV, 1, 99) &&
    optInRange(repsV, 1, 999) &&
    optInRange(loadV, 0, 500);

  const kcalV = kcal.trim() === "" ? 0 : toNum(kcal);
  const proteinV = optNum(proteinG);
  const waterV = optNum(waterMl);
  const mealValid =
    label.trim().length > 0 &&
    inRange(kcalV, 0, 5000) &&
    optInRange(proteinV, 0, 300) &&
    optInRange(waterV, 0, 5000) &&
    (kcalV > 0 || (waterV !== null && waterV > 0));

  const evaV = toNum(evaText);
  const evaValid = inRange(evaV, 0, 12);
  const activeEva = evaValid ? evaV : (summary?.evaHours ?? 0);

  const addExercise = async () => {
    const ok = await run(() =>
      addWorkoutEntry({
        day,
        presetId: presetId || "custom",
        name: name.trim(),
        category,
        minutes: Math.round(min),
        sets: setsV,
        reps: repsV,
        loadKg: loadV,
        note: note.trim() === "" ? null : note.trim(),
      }),
    );
    if (ok) {
      setPresetId("");
      setName("");
      setSets("");
      setReps("");
      setLoadKg("");
      setNote("");
    }
  };

  const addMeal = async (item: {
    label: string;
    mealType: MealType;
    kcal: number;
    proteinG: number | null;
    waterMl: number | null;
  }) => run(() => addNutritionEntry({ day, ...item }));

  const s = summary;
  const targetKcal = s?.targetKcal ?? BASE_KCAL;
  const intakeKcal = s?.totalKcal ?? 0;
  const filledKcal = Math.min(SEGMENTS, Math.round((intakeKcal / targetKcal) * SEGMENTS));
  const overKcal = intakeKcal > targetKcal;
  const pctKcal = targetKcal > 0 ? Math.round((intakeKcal / targetKcal) * 100) : 0;

  const targetWater = targetWaterMlFor(s?.evaHours ?? 0);
  const intakeWater = s?.totalWaterMl ?? 0;
  const filledWater = Math.min(SEGMENTS, Math.round((intakeWater / targetWater) * SEGMENTS));
  const pctWater = targetWater > 0 ? Math.round((intakeWater / targetWater) * 100) : 0;

  const nutritionSources = [
    SOURCES["std-nutrition"],
    SOURCES["std-hydration"],
    SOURCES["risk-nutrition"],
  ].filter(Boolean);

  return (
    <div className="wf-root">
      {/* day sync */}
      <div className="wf-daybar">
        <button type="button" className="wf-step" aria-label="Previous day" disabled={day <= 1} onClick={() => goDay(day - 1)}>
          ‹
        </button>
        <label className="wf-dayfield">
          <span className="wf-eyebrow">Mission day</span>
          <span className="wf-daynum">
            <input
              className="wf-input wf-input-day"
              inputMode="numeric"
              value={dayText}
              onChange={(e) => setDayText(e.target.value)}
              onBlur={() => {
                const n = toNum(dayText);
                if (Number.isFinite(n)) goDay(n);
                else setDayText(String(day));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
            <span className="wf-dim">/ {MAX_DAY}</span>
          </span>
        </label>
        <button type="button" className="wf-step" aria-label="Next day" disabled={day >= MAX_DAY} onClick={() => goDay(day + 1)}>
          ›
        </button>
        <button type="button" className="wf-btn wf-btn-sm" disabled={day === missionDay} onClick={() => goDay(missionDay)}>
          Sync day {missionDay}
        </button>
      </div>

      {/* summary strip */}
      <div className="wf-strip">
        <div className="wf-cell">
          <span className="wf-eyebrow">Completed</span>
          <b>
            {s?.completedSessions ?? 0}/{s?.totalSessions ?? 0}
          </b>
        </div>
        <div className="wf-cell">
          <span className="wf-eyebrow">Total min</span>
          <b>{s?.totalExerciseMin ?? 0}</b>
        </div>
        <div className="wf-cell">
          <span className="wf-eyebrow">Intake / NASA target</span>
          <b>
            {fmt(intakeKcal)}
            <i> / {fmt(targetKcal)} kcal</i>
          </b>
        </div>
        <div className="wf-cell">
          <span className="wf-eyebrow">Water / NASA min</span>
          <b>
            {fmt(intakeWater)}
            <i> / {fmt(targetWater)} ml</i>
          </b>
        </div>
      </div>

      {err && <div className="tb-warn-box tb-err">{err}</div>}

      {/* exercise */}
      <section className="wf-block">
        <div className="wf-head">
          <span className="wf-title">Countermeasure exercise</span>
          <span className="wf-badge" data-basis="illustrative" title="Protocols are illustrative, not a NASA prescription">
            ILLUSTRATIVE
          </span>
        </div>

        <button type="button" className="wf-btn" disabled={busy} onClick={() => void run(() => seedDefaultWorkoutDay(day))}>
          Load default protocol
        </button>

        {s && s.workouts.length > 0 ? (
          <ul className="wf-list">
            {s.workouts.map((w) => (
              <li key={w.id} data-done={w.done}>
                <button
                  type="button"
                  className="wf-check"
                  role="checkbox"
                  aria-checked={w.done}
                  aria-label={`Mark ${w.name} ${w.done ? "not done" : "done"}`}
                  data-on={w.done}
                  disabled={busy}
                  onClick={() => void run(() => toggleWorkoutEntry(day, w.id))}
                />
                <div className="wf-item">
                  <span className="wf-item-name">{w.name}</span>
                  <span className="wf-dim">
                    {CATEGORY_LABEL[w.category]} · {w.minutes} min
                    {w.sets != null && ` · ${w.sets}×${w.reps ?? "—"}`}
                    {w.loadKg != null && ` · ${w.loadKg} kg`}
                  </span>
                  {w.note && <span className="wf-note">{w.note}</span>}
                </div>
                <button
                  type="button"
                  className="wf-x"
                  aria-label={`Remove ${w.name}`}
                  disabled={busy}
                  onClick={() => void run(() => deleteWorkoutEntry(day, w.id))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="wf-empty">No sessions logged for day {day}.</p>
        )}

        <div className="wf-form">
          <span className="wf-eyebrow">Add session</span>
          <select className="wf-input" value={presetId} onChange={(e) => pickPreset(e.target.value)} aria-label="Exercise preset">
            <option value="">Custom / choose preset…</option>
            {(["ared", "cardio", "mobility"] as const).map((cat) => (
              <optgroup key={cat} label={CATEGORY_LABEL[cat]}>
                {catalog
                  .filter((p) => p.category === cat)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <div className="wf-row2">
            <input className="wf-input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            <select className="wf-input" value={category} onChange={(e) => setCategory(e.target.value as ExerciseCategory)} aria-label="Category">
              {(["ared", "cardio", "mobility"] as const).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="wf-row4">
            <label>
              <span className="wf-eyebrow">Min</span>
              <input className="wf-input" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </label>
            <label>
              <span className="wf-eyebrow">Sets</span>
              <input className="wf-input" inputMode="numeric" placeholder="—" value={sets} onChange={(e) => setSets(e.target.value)} />
            </label>
            <label>
              <span className="wf-eyebrow">Reps</span>
              <input className="wf-input" inputMode="numeric" placeholder="—" value={reps} onChange={(e) => setReps(e.target.value)} />
            </label>
            <label>
              <span className="wf-eyebrow">Load kg</span>
              <input className="wf-input" inputMode="decimal" placeholder="—" value={loadKg} onChange={(e) => setLoadKg(e.target.value)} />
            </label>
          </div>
          <input className="wf-input" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} />
          <button type="button" className="wf-btn wf-btn-primary" disabled={!exerciseValid || busy} onClick={() => void addExercise()}>
            Add session
          </button>
          <p className="wf-foot">Minutes 1–240. Sessions are logged for adherence only; no calorie-burn is fabricated.</p>
        </div>
      </section>

      {/* nutrition */}
      <section className="wf-block">
        <div className="wf-head">
          <span className="wf-title">Nutrition &amp; hydration targets</span>
          <span className="wf-badge" data-basis="nasa" title="NASA-STD-3001 Vol 2 [V2 7003 / V2 7004 / V2 6109 / V2 11030]">
            NASA-STD-3001
          </span>
        </div>

        <div className="wf-eva">
          <label className="wf-evafield">
            <span className="wf-eyebrow">EVA hours (0–12)</span>
            <input
              className="wf-input wf-input-eva"
              inputMode="decimal"
              value={evaText}
              onChange={(e) => setEvaText(e.target.value)}
              onBlur={() => {
                if (evaValid && evaV !== (s?.evaHours ?? 0)) void run(() => setDayEvaHours(day, evaV));
                else if (!evaValid) setEvaText(String(s?.evaHours ?? 0));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          </label>
          <div className="wf-formula">
            <span className="wf-mono">
              Energy: {fmt(BASE_KCAL)} + {KCAL_PER_EVA_HOUR} × {activeEva} = <b>{fmt(BASE_KCAL + KCAL_PER_EVA_HOUR * activeEva)}</b> kcal
            </span>
            <span className="wf-mono">
              Water: {fmt(BASE_WATER_ML)} + {WATER_ML_PER_EVA_HOUR} × {activeEva} = <b>{fmt(targetWaterMlFor(activeEva))}</b> ml
            </span>
            <span className="wf-dim">NASA-STD-3001 Vol 2 [V2 7003/7004] · [V2 6109/11030]</span>
          </div>
        </div>

        {/* Energy bar */}
        <div className="wf-bar" data-over={overKcal} role="progressbar" aria-label="Caloric intake" aria-valuemin={0} aria-valuemax={targetKcal} aria-valuenow={intakeKcal}>
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <i key={i} data-on={i < filledKcal} />
          ))}
        </div>
        <div className="wf-barlabel">
          <span className="wf-mono">
            Energy: {fmt(intakeKcal)} kcal · {pctKcal}%
          </span>
          <span className="wf-dim">
            {overKcal ? `+${fmt(intakeKcal - targetKcal)} over target` : `${fmt(Math.max(0, targetKcal - intakeKcal))} to target`}
          </span>
        </div>

        {/* Water bar */}
        <div className="wf-bar wf-bar-water" role="progressbar" aria-label="Water intake" aria-valuemin={0} aria-valuemax={targetWater} aria-valuenow={intakeWater}>
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <i key={i} data-on={i < filledWater} />
          ))}
        </div>
        <div className="wf-barlabel">
          <span className="wf-mono">
            Water: {fmt(intakeWater)} ml · {pctWater}%
          </span>
          <span className="wf-dim">
            {intakeWater >= targetWater ? "Daily minimum met" : `${fmt(targetWater - intakeWater)} ml to NASA min`}
          </span>
        </div>

        <div className="wf-quick">
          {QUICK.map((q) => (
            <button key={q.label} type="button" className="wf-btn wf-quickbtn" disabled={busy} onClick={() => void addMeal(q)}>
              <span>{q.label}</span>
              <small>{q.hint}</small>
            </button>
          ))}
        </div>

        {s && s.meals.length > 0 ? (
          <ul className="wf-list">
            {s.meals.map((m) => (
              <li key={m.id} data-meal>
                <span className="wf-mealtype">{MEAL_LABEL[m.mealType]}</span>
                <div className="wf-item">
                  <span className="wf-item-name">{m.label}</span>
                  <span className="wf-dim">
                    {m.kcal} kcal
                    {m.proteinG != null && ` · ${m.proteinG} g protein`}
                    {m.waterMl != null && ` · ${m.waterMl} ml`}
                  </span>
                </div>
                <button
                  type="button"
                  className="wf-x"
                  aria-label={`Remove ${m.label}`}
                  disabled={busy}
                  onClick={() => void run(() => deleteNutritionEntry(day, m.id))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="wf-empty">No intake logged for day {day}.</p>
        )}

        <div className="wf-form">
          <span className="wf-eyebrow">Custom entry</span>
          <div className="wf-row2">
            <input className="wf-input" placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
            <select className="wf-input" value={mealType} onChange={(e) => setMealType(e.target.value as MealType)} aria-label="Meal type">
              {MEAL_TYPES.map((m) => (
                <option key={m} value={m}>
                  {MEAL_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
          <div className="wf-row3">
            <label>
              <span className="wf-eyebrow">kcal</span>
              <input className="wf-input" inputMode="numeric" placeholder="0" value={kcal} onChange={(e) => setKcal(e.target.value)} />
            </label>
            <label>
              <span className="wf-eyebrow">Protein g</span>
              <input className="wf-input" inputMode="decimal" placeholder="—" value={proteinG} onChange={(e) => setProteinG(e.target.value)} />
            </label>
            <label>
              <span className="wf-eyebrow">Water ml</span>
              <input className="wf-input" inputMode="numeric" placeholder="—" value={waterMl} onChange={(e) => setWaterMl(e.target.value)} />
            </label>
          </div>
          <button
            type="button"
            className="wf-btn wf-btn-primary"
            disabled={!mealValid || busy}
            onClick={async () => {
              const ok = await addMeal({
                label: label.trim(),
                mealType,
                kcal: Math.round(kcalV),
                proteinG: proteinV,
                waterMl: waterV === null ? null : Math.round(waterV),
              });
              if (ok) {
                setLabel("");
                setKcal("");
                setProteinG("");
                setWaterMl("");
              }
            }}
          >
            Log entry
          </button>
          <p className="wf-foot">Quick-log amounts are nominal shortcuts; use a custom entry for exact package values.</p>
        </div>

        {/* Inline official NASA source ledger */}
        <div className="wf-sources">
          <div className="wf-head">
            <span className="wf-eyebrow">Official NASA sources (checked {CHECKED})</span>
            <span className="wf-badge" data-basis="nasa">NASA.GOV</span>
          </div>
          <ul>
            {nutritionSources.map((src) => (
              <li key={src.title}>
                <span>{src.title}</span>
                <span>{src.url}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}