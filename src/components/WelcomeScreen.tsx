import { useEffect, useMemo, useState } from "react";
import type { BodyProfile, BodyZone, Level, Sex } from "../types";
import type { BodyProfileApi } from "../hooks/useBodyProfile";
import { PROFILE_LIMITS, plausibilityWarnings } from "../bodyParams";
import { I18N } from "../i18n";
import { CHECKED, SOURCES } from "../sources";
import { TABLET_I18N } from "../tablet/tabletI18n";
import {
  DEFAULT_CREW_PROFILE,
  deleteCrewSlot,
  saveCrewSlot,
  selectCrewSlot,
  type CrewBodyBaseline,
  type CrewProfile,
  type CrewRoster,
  type CrewSlot,
} from "../api/stage6";
import "./WelcomeScreen.css";

interface Props {
  roster: CrewRoster;
  body: BodyProfileApi;
  zones: BodyZone[];
  commsDelayMin: number;
  /** True when reopened from the top-bar chip: skips the initial Hello stroke animation unless replayed. */
  reopened: boolean;
  onRosterChange: (roster: CrewRoster) => void;
  onClose: () => void;
}

type Phase = "hello" | "choice" | "baseline" | "briefing";

export const ROLES = ["Commander", "Flight Engineer", "Payload Specialist", "Crew Medical Officer"] as const;
const ROLE_ABBR: Record<string, string> = {
  Commander: "CDR",
  "Flight Engineer": "FE",
  "Payload Specialist": "PS",
  "Crew Medical Officer": "CMO",
};
export const roleAbbr = (role: string): string => ROLE_ABBR[role] ?? "CREW";

const SEXES: Sex[] = ["neutral", "male", "female"];
const SLIDERS = ["muscularity", "shoulderWidth", "waist", "hips"] as const;
type NumField = "heightCm" | "weightKg" | "bodyFatPct";
const NUM_FIELDS: NumField[] = ["heightCm", "weightKg", "bodyFatPct"];
const NUM_UNIT: Record<NumField, string> = { heightCm: "cm", weightKg: "kg", bodyFatPct: "%" };

const parse = (s: string) => parseFloat(s.replace(",", "."));
const within = (v: number, lo: number, hi: number) => Number.isFinite(v) && v >= lo && v <= hi;

function clampTo(k: NumField, v: number): number {
  const L = PROFILE_LIMITS[k];
  return Math.min(L.max, Math.max(L.min, v));
}

function activeOf(r: CrewRoster): CrewSlot {
  return r.slots.find((s) => s.id === r.activeId) ?? r.slots[0];
}

export function WelcomeScreen({
  roster,
  body,
  zones,
  commsDelayMin,
  reopened,
  onRosterChange,
  onClose,
}: Props) {
  const T = TABLET_I18N.en;
  const L = I18N.en;

  const initialSlot = activeOf(roster);

  const [phase, setPhase] = useState<Phase>(() =>
    !reopened && !initialSlot.crew.onboarded ? "hello" : "baseline",
  );
  const [editingId, setEditingId] = useState<string>(initialSlot.id);
  const [presetKind, setPresetKind] = useState<"nasa-reference" | "custom">(initialSlot.presetKind);
  const [missionBio, setMissionBio] = useState(initialSlot.missionBio);
  const [sourceId, setSourceId] = useState(initialSlot.sourceId);

  const [callsign, setCallsign] = useState(initialSlot.crew.callsign);
  const [fullName, setFullName] = useState(initialSlot.crew.fullName);
  const [role, setRole] = useState<string>(initialSlot.crew.role || DEFAULT_CREW_PROFILE.role);
  const [age, setAge] = useState(String(initialSlot.crew.ageYears));
  const [hr, setHr] = useState(String(initialSlot.crew.baselineHrBpm));
  const [sys, setSys] = useState(String(initialSlot.crew.baselineSysMmhg));
  const [dia, setDia] = useState(String(initialSlot.crew.baselineDiaMmhg));
  const [eva, setEva] = useState(String(initialSlot.crew.defaultEvaHours));
  const [numText, setNumText] = useState<Record<NumField, string>>({
    heightCm: String(initialSlot.body.heightCm),
    weightKg: String(initialSlot.body.weightKg),
    bodyFatPct: String(initialSlot.body.bodyFatPct),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [zoneSel, setZoneSel] = useState("heart");
  const [moduleSel, setModuleSel] = useState("checkIn");

  useEffect(() => {
    if (phase !== "hello") return;
    const id = window.setTimeout(() => setPhase("choice"), 2350);
    return () => window.clearTimeout(id);
  }, [phase]);

  useEffect(() => {
    body.setDraft(initialSlot.body);
    body.commitGeometry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hydrateFromSlot = (slot: CrewSlot) => {
    setEditingId(slot.id);
    setPresetKind(slot.presetKind);
    setMissionBio(slot.missionBio);
    setSourceId(slot.sourceId);
    setCallsign(slot.crew.callsign);
    setFullName(slot.crew.fullName);
    setRole(slot.crew.role || DEFAULT_CREW_PROFILE.role);
    setAge(String(slot.crew.ageYears));
    setHr(String(slot.crew.baselineHrBpm));
    setSys(String(slot.crew.baselineSysMmhg));
    setDia(String(slot.crew.baselineDiaMmhg));
    setEva(String(slot.crew.defaultEvaHours));
    setNumText({
      heightCm: String(slot.body.heightCm),
      weightKg: String(slot.body.weightKg),
      bodyFatPct: String(slot.body.bodyFatPct),
    });
    body.setDraft(slot.body);
    body.commitGeometry();
  };

  const placeholder = useMemo(() => `${roleAbbr(role)}-0${Math.min(7, roster.slots.length + 1)}`, [role, roster.slots.length]);

  const ageV = parse(age);
  const hrV = parse(hr);
  const sysV = parse(sys);
  const diaV = parse(dia);
  const evaV = parse(eva);
  const errors: string[] = [];
  if (!within(ageV, 18, 75) || !Number.isInteger(ageV)) errors.push("Age must be a whole number, 18–75.");
  if (!within(hrV, 35, 120)) errors.push("Resting HR must be 35–120 bpm.");
  if (!within(sysV, 80, 180)) errors.push("Systolic must be 80–180 mmHg.");
  if (!within(diaV, 45, 110)) errors.push("Diastolic must be 45–110 mmHg.");
  if (Number.isFinite(sysV) && Number.isFinite(diaV) && sysV <= diaV) errors.push("Systolic must be higher than diastolic.");
  if (!within(evaV, 0, 12)) errors.push("Default EVA hours must be 0–12.");
  const valid = errors.length === 0;

  const warnings = plausibilityWarnings(body.draft);
  const m = body.metrics;

  const commitNum = (k: NumField) => {
    const v = parse(numText[k]);
    if (Number.isFinite(v)) body.setDraft({ [k]: v } as Partial<BodyProfile>);
    body.commitGeometry();
    setNumText((t) => ({ ...t, [k]: String(clampTo(k, Number.isFinite(v) ? v : body.draft[k])) }));
  };

  const buildSlot = (walkthroughCompleted: boolean): CrewSlot => {
    const crew: CrewProfile = {
      onboarded: true,
      walkthroughCompleted,
      callsign: callsign.trim() === "" ? placeholder : callsign.trim().toUpperCase(),
      fullName: fullName.trim(),
      role,
      ageYears: Math.round(ageV),
      baselineHrBpm: Math.round(hrV),
      baselineSysMmhg: Math.round(sysV),
      baselineDiaMmhg: Math.round(diaV),
      defaultEvaHours: evaV,
    };
    const bodySnap: CrewBodyBaseline = {
      sex: body.draft.sex,
      heightCm: body.draft.heightCm,
      weightKg: body.draft.weightKg,
      bodyFatPct: body.draft.bodyFatPct,
      muscularity: body.draft.muscularity,
      shoulderWidth: body.draft.shoulderWidth,
      waist: body.draft.waist,
      hips: body.draft.hips,
    };
    return {
      id: editingId,
      presetKind,
      missionBio,
      sourceId: sourceId || "mars-dra5",
      crew,
      body: bodySnap,
    };
  };

  const switchSlot = async (id: string) => {
    setBusy(true);
    setErr(null);
    try {
      const next = await selectCrewSlot(id);
      onRosterChange(next);
      const picked = next.slots.find((s) => s.id === id) ?? activeOf(next);
      hydrateFromSlot(picked);
      body.setDraft(picked.body);
      await body.apply();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const startNewSlot = () => {
    if (roster.slots.length >= roster.maxSlots) return;
    const nextNum = roster.slots.length + 1;
    const blank: CrewSlot = {
      id: "",
      presetKind: "custom",
      missionBio: "Custom on-board crew profile (NASA Mars DRA 5.0 baseline: 6 crew · ISS complement max: 7).",
      sourceId: "mars-dra5",
      crew: {
        ...DEFAULT_CREW_PROFILE,
        callsign: `CREW-0${nextNum}`,
        fullName: "",
        role: "Flight Engineer",
      },
      body: {
        sex: "neutral",
        heightCm: 175,
        weightKg: 72,
        bodyFatPct: 18,
        muscularity: 0.5,
        shoulderWidth: 1.0,
        waist: 1.0,
        hips: 1.0,
      },
    };
    hydrateFromSlot(blank);
  };

  const removeSlot = async (id: string) => {
    if (roster.slots.length <= 1) return;
    setBusy(true);
    setErr(null);
    try {
      const next = await deleteCrewSlot(id);
      onRosterChange(next);
      const picked = activeOf(next);
      hydrateFromSlot(picked);
      body.setDraft(picked.body);
      await body.apply();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const persistCurrent = async (walkthroughCompleted: boolean): Promise<boolean> => {
    if (!valid) return false;
    setBusy(true);
    setErr(null);
    try {
      const nextRoster = await saveCrewSlot(buildSlot(walkthroughCompleted));
      onRosterChange(nextRoster);
      const saved = activeOf(nextRoster);
      setEditingId(saved.id);
      await body.apply();
      return true;
    } catch (e) {
      setErr(String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const launchDefaults = async (slotOverride?: CrewSlot) => {
    setBusy(true);
    setErr(null);
    try {
      const target = slotOverride ?? activeOf(roster);
      const ready: CrewSlot = {
        ...target,
        crew: { ...target.crew, onboarded: true, walkthroughCompleted: true },
      };
      const nextRoster = await saveCrewSlot(ready);
      onRosterChange(nextRoster);
      body.setDraft(target.body);
      await body.apply();
      onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const currentSource = SOURCES[sourceId] ?? SOURCES["mars-dra5"];
  const draSource = SOURCES["mars-dra5"];
  const zoneText = L.zones[zoneSel];
  const zoneLevel = (id: string): Level => zones.find((z) => z.id === id)?.level ?? "nominal";
  const zoneMetric = zones.find((z) => z.id === zoneSel)?.metric ?? "";
  const moduleKeys = ["checkIn", "myBody", "mindData", "workout"] as const;
  const moduleText = T.sections[moduleSel];

  if (phase === "hello") {
    return (
      <div className="wc wc-stage" role="dialog" aria-modal="true" aria-label="Welcome to Selena" onClick={() => setPhase("choice")}>
        <div className="wc-hello-box">
          <div className="wc-term-line">~/selena/boot $ init --flight-deck --offline</div>
          <svg className="wc-hello-svg" viewBox="0 0 420 140" aria-label="Hello">
            <path
              className="wc-hello-stroke"
              d="M 44 102 C 58 68, 72 34, 80 18 C 72 48, 56 84, 48 106 M 58 66 C 72 58, 92 52, 102 44 C 108 38, 114 22, 116 18 C 108 46, 98 84, 94 104 C 104 104, 116 92, 128 80 C 138 70, 146 66, 152 72 C 158 78, 146 88, 134 86 C 122 84, 124 104, 144 104 C 160 104, 178 76, 194 48 C 204 30, 212 16, 206 16 C 198 16, 184 52, 180 86 C 178 102, 188 106, 204 94 C 222 80, 240 48, 252 24 C 258 14, 250 14, 240 32 C 228 54, 220 84, 224 98 C 228 108, 244 104, 258 88 C 266 78, 276 66, 290 66 C 304 66, 312 78, 308 92 C 304 104, 288 108, 276 100 C 266 92, 268 74, 282 68 C 296 62, 314 70, 326 78"
            />
            <circle className="wc-hello-dot" cx="348" cy="96" r="5.5" />
          </svg>
          <p className="wc-hello-sub">SELENA · AUTONOMOUS MARS-TRANSIT CLINICAL CONSOLE</p>
          <button
            type="button"
            className="wc-skip"
            onClick={(e) => {
              e.stopPropagation();
              setPhase("choice");
            }}
          >
            Click anywhere or press to continue ›
          </button>
        </div>
      </div>
    );
  }

  if (phase === "choice") {
    return (
      <div className="wc wc-stage" role="dialog" aria-modal="true" aria-label="Mission onboarding">
        <div className="wc-choice-card">
          <div className="wc-choice-top">
            <span className="wc-term-line">~/selena/crew $ crew --select --max-slots={roster.maxSlots}</span>
            <button type="button" className="wc-link-btn" onClick={() => setPhase("hello")}>
              Replay Hello
            </button>
          </div>

          <h1 className="wc-hero-title">
            Hello, <span>Crew.</span>
          </h1>
          <p className="wc-hero-lead">
            You can enter your baseline parameters or continue with mission defaults.
          </p>

          <div className="wc-hero-actions">
            <button
              type="button"
              className="wc-btn wc-btn-mono-primary"
              disabled={busy}
              onClick={() => setPhase("baseline")}
            >
              Enter Your Parameters
            </button>
            <button
              type="button"
              className="wc-btn"
              disabled={busy}
              onClick={() => void launchDefaults()}
            >
              {busy ? "Loading…" : "Use Mission Defaults"}
            </button>
            <button
              type="button"
              className="wc-btn"
              disabled={busy}
              onClick={() => setPhase("briefing")}
            >
              60s Deck Briefing
            </button>
          </div>

          <div className="wc-preset-wrap">
            <div className="wc-preset-head">
              <span className="eyebrow">
                On-board crew presets ({roster.slots.length}/{roster.maxSlots} slots · NASA DRA 5.0 baseline: 6 / ISS max: 7)
              </span>
              <span className="wc-dim">Public NASA bios · Illustrative baseline defaults</span>
            </div>

            <div className="wc-preset-grid">
              {roster.slots.map((slot) => {
                const src = SOURCES[slot.sourceId];
                const isActive = slot.id === roster.activeId;
                return (
                  <div key={slot.id} className="wc-preset-card" data-active={isActive}>
                    <div className="wc-preset-top">
                      <span className="wc-preset-callsign">{slot.crew.callsign}</span>
                      <span className="wc-tag">{slot.presetKind === "nasa-reference" ? "NASA BIO" : "SAVED"}</span>
                    </div>
                    <div className="wc-preset-name">{slot.crew.fullName || slot.crew.callsign}</div>
                    <div className="wc-preset-meta">
                      {slot.crew.role} · Age {slot.crew.ageYears} · {slot.body.heightCm} cm / {slot.body.weightKg} kg
                    </div>
                    {slot.missionBio && <p className="wc-preset-bio">{slot.missionBio}</p>}
                    {src && <div className="wc-preset-src">{src.url}</div>}
                    <div className="wc-preset-btns">
                      <button
                        type="button"
                        className="wc-btn wc-btn-sm"
                        disabled={busy}
                        onClick={() => {
                          hydrateFromSlot(slot);
                          setPhase("baseline");
                        }}
                      >
                        Customize
                      </button>
                      <button
                        type="button"
                        className="wc-btn wc-btn-sm wc-btn-mono-primary"
                        disabled={busy}
                        onClick={() => void launchDefaults(slot)}
                      >
                        Launch as {slot.crew.callsign}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {draSource && (
              <div className="wc-src-foot">
                <span>{draSource.title}</span>
                <span>{draSource.url}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wc" role="dialog" aria-modal="true" aria-label="Crew registration and flight deck briefing">
      <div className="wc-frame">
        <header className="wc-head">
          <div className="wc-brand">
            <span className="mark" />
            <span className="wordmark">SELENA</span>
            <span className="wc-sep" />
            <span className="wc-title">
              {phase === "baseline"
                ? `~/crew-roster (${roster.slots.length}/${roster.maxSlots}) · registration & physiological baseline`
                : "~/briefing · 60-second flight deck orientation"}
            </span>
          </div>
          <div className="wc-steps" aria-label="Progress">
            <button type="button" className="wc-step-tab" data-on={phase === "baseline"} onClick={() => setPhase("baseline")}>
              1 Baseline
            </button>
            <button type="button" className="wc-step-tab" data-on={phase === "briefing"} onClick={() => setPhase("briefing")}>
              2 Briefing
            </button>
          </div>
          <button type="button" className="wc-link-btn" onClick={() => setPhase("hello")}>
            Hello Intro
          </button>
          {reopened && (
            <button type="button" className="wc-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          )}
        </header>

        {phase === "baseline" ? (
          <div className="wc-body" key="baseline">
            <section className="wc-roster-bar">
              <div className="wc-roster-top">
                <div className="wc-roster-title">
                  <span className="eyebrow">
                    Crew slots ({roster.slots.length}/{roster.maxSlots}) · NASA Mars DRA 5.0 baseline: 6 / ISS max: 7
                  </span>
                </div>
                <div className="wc-roster-actions">
                  <button
                    type="button"
                    className="wc-btn wc-btn-sm"
                    disabled={busy || roster.slots.length >= roster.maxSlots}
                    onClick={startNewSlot}
                  >
                    + New Crew ({roster.slots.length}/{roster.maxSlots})
                  </button>
                  {editingId !== "" && roster.slots.length > 1 && (
                    <button
                      type="button"
                      className="wc-btn wc-btn-sm wc-btn-danger"
                      disabled={busy}
                      onClick={() => void removeSlot(editingId)}
                    >
                      Remove Slot
                    </button>
                  )}
                </div>
              </div>

              <div className="wc-slot-strip" role="tablist" aria-label="Saved crew profiles">
                {roster.slots.map((slot) => {
                  const selected = slot.id === editingId;
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      className="wc-slot-pill"
                      data-active={selected}
                      disabled={busy}
                      onClick={() => void switchSlot(slot.id)}
                    >
                      <span className="wc-slot-cs">{slot.crew.callsign || "NEW"}</span>
                      <span className="wc-slot-role">{roleAbbr(slot.crew.role)}</span>
                      {slot.presetKind === "nasa-reference" && <span className="wc-slot-nasa">NASA</span>}
                    </button>
                  );
                })}
              </div>

              {missionBio && (
                <div className="wc-bio-note">
                  <span>{missionBio}</span>
                  {currentSource && (
                    <span className="wc-bio-src">
                      Source: {currentSource.title} — {currentSource.url} (checked {CHECKED})
                    </span>
                  )}
                </div>
              )}
            </section>

            <div className="wc-grid3">
              <fieldset className="wc-set">
                <legend>Identity</legend>
                <label className="wc-field">
                  <span>Callsign</span>
                  <input
                    className="wc-input"
                    value={callsign}
                    placeholder={placeholder}
                    maxLength={16}
                    onChange={(e) => setCallsign(e.target.value)}
                  />
                </label>
                <label className="wc-field">
                  <span>Full name</span>
                  <input className="wc-input" value={fullName} maxLength={60} onChange={(e) => setFullName(e.target.value)} />
                </label>
                <label className="wc-field">
                  <span>Role</span>
                  <select className="wc-input" value={role} onChange={(e) => setRole(e.target.value)}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="wc-field">
                  <span>Age (18–75)</span>
                  <input className="wc-input" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} />
                </label>
              </fieldset>

              <fieldset className="wc-set">
                <legend>Resting baseline</legend>
                <label className="wc-field">
                  <span>Heart rate · bpm (35–120)</span>
                  <input className="wc-input" inputMode="numeric" value={hr} onChange={(e) => setHr(e.target.value)} />
                </label>
                <div className="wc-pair">
                  <label className="wc-field">
                    <span>Systolic · mmHg (80–180)</span>
                    <input className="wc-input" inputMode="numeric" value={sys} onChange={(e) => setSys(e.target.value)} />
                  </label>
                  <label className="wc-field">
                    <span>Diastolic · mmHg (45–110)</span>
                    <input className="wc-input" inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value)} />
                  </label>
                </div>
                <label className="wc-field">
                  <span>Default EVA hours / day (0–12)</span>
                  <input className="wc-input" inputMode="decimal" value={eva} onChange={(e) => setEva(e.target.value)} />
                </label>
                <p className="wc-hint">
                  Energy = 3,035 + 200 × EVA kcal/day [V2 7003/7004] · Water = 2,500 + 240 × EVA mL/day [V2 6109/11030].
                  Source: {SOURCES["std-nutrition"].url}
                </p>
              </fieldset>

              <fieldset className="wc-set">
                <legend>Anthropometric baseline (3D Twin)</legend>
                <div className="wc-seg" role="radiogroup" aria-label={T.body.sex}>
                  {SEXES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={body.draft.sex === s}
                      data-active={body.draft.sex === s}
                      onClick={() => {
                        body.setDraft({ sex: s });
                        body.commitGeometry();
                      }}
                    >
                      {T.body.sexOpts[s]}
                    </button>
                  ))}
                </div>
                <div className="wc-trio">
                  {NUM_FIELDS.map((k) => (
                    <label className="wc-field" key={k}>
                      <span>
                        {T.body.fields[k]} · {NUM_UNIT[k]}
                      </span>
                      <input
                        className="wc-input"
                        inputMode="decimal"
                        value={numText[k]}
                        onChange={(e) => setNumText((t) => ({ ...t, [k]: e.target.value }))}
                        onBlur={() => commitNum(k)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                      />
                    </label>
                  ))}
                </div>
                {SLIDERS.map((k) => {
                  const lim = PROFILE_LIMITS[k];
                  const val = body.draft[k];
                  const p = ((val - lim.min) / (lim.max - lim.min)) * 100;
                  return (
                    <label className="wc-slider" key={k}>
                      <span className="wc-slider-head">
                        <span>{T.body.fields[k]}</span>
                        <b>{val.toFixed(2)}</b>
                      </span>
                      <input
                        type="range"
                        className="wc-range"
                        style={{ ["--p" as string]: `${p}%` }}
                        min={lim.min}
                        max={lim.max}
                        step={lim.step}
                        value={val}
                        onChange={(e) => body.setDraft({ [k]: parseFloat(e.target.value) } as Partial<BodyProfile>)}
                        onPointerUp={body.commitGeometry}
                        onKeyUp={body.commitGeometry}
                        onBlur={body.commitGeometry}
                      />
                    </label>
                  );
                })}
                <dl className="wc-metrics">
                  <div>
                    <dt>BMI</dt>
                    <dd>
                      {m.bmi.toFixed(1)} <i>{T.body.categories[m.bmiCategory]}</i>
                    </dd>
                  </div>
                  <div>
                    <dt>Lean mass</dt>
                    <dd>{m.leanMassKg.toFixed(1)} kg</dd>
                  </div>
                  <div>
                    <dt>FFMI</dt>
                    <dd>{m.ffmi.toFixed(1)}</dd>
                  </div>
                </dl>
                {warnings.length > 0 && (
                  <ul className="wc-warn">
                    {warnings.map((w) => (
                      <li key={w}>{T.body.warnings[w] ?? w}</li>
                    ))}
                  </ul>
                )}
              </fieldset>
            </div>

            {errors.length > 0 && (
              <ul className="wc-errors">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            {err && <div className="wc-errors wc-errbox">{err}</div>}

            <footer className="wc-foot">
              <span className="wc-dim">Stored locally in app_data_dir/crew_roster.json · Zero network calls.</span>
              <div className="wc-foot-btns">
                <button
                  type="button"
                  className="wc-btn"
                  disabled={!valid || busy}
                  onClick={async () => {
                    if (await persistCurrent(true)) onClose();
                  }}
                >
                  Save &amp; Enter Deck
                </button>
                <button
                  type="button"
                  className="wc-btn wc-btn-mono-primary"
                  disabled={!valid || busy}
                  onClick={async () => {
                    if (await persistCurrent(activeOf(roster).crew.walkthroughCompleted)) setPhase("briefing");
                  }}
                >
                  {busy ? "Saving…" : "Save & View Briefing ›"}
                </button>
              </div>
            </footer>
          </div>
        ) : (
          <div className="wc-body" key="briefing">
            <div className="wc-grid2">
              <section className="wc-card">
                <header>
                  <h3>Bio-Digital Twin</h3>
                  <span className="wc-tag">LiDAR | Holo</span>
                </header>
                <p>
                  A 3D body model scaled to the active crew slot baseline. Switch LiDAR point-cloud and Holo mesh views, and click any of six zones.
                </p>
                <div className="wc-zones" role="tablist">
                  {(["brain", "eyes", "heart", "lungs", "bones", "radiation"] as const).map((id) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={zoneSel === id}
                      data-active={zoneSel === id}
                      data-level={zoneLevel(id)}
                      onClick={() => setZoneSel(id)}
                    >
                      <span className="dot" />
                      {L.zones[id]?.name ?? id}
                    </button>
                  ))}
                </div>
                {zoneText && (
                  <div className="wc-zonebox" data-level={zoneLevel(zoneSel)}>
                    <span className="wc-mono">
                      {L.levels[zoneLevel(zoneSel)]}
                      {zoneMetric && ` · ${zoneMetric}`}
                    </span>
                    <span>{zoneText.why}</span>
                  </div>
                )}
              </section>

              <section className="wc-card">
                <header>
                  <h3>CDSS Medical Tablet</h3>
                  <span className="wc-tag">4 modules</span>
                </header>
                <p>Open the Tablet from the top bar. Every check-in, body profile, and workout entry persists to the local Rust store.</p>
                <div className="wc-zones" role="tablist">
                  {moduleKeys.map((k) => (
                    <button key={k} type="button" role="tab" aria-selected={moduleSel === k} data-active={moduleSel === k} onClick={() => setModuleSel(k)}>
                      {T.sections[k]?.title ?? k}
                    </button>
                  ))}
                </div>
                {moduleText && (
                  <div className="wc-zonebox">
                    <span className="wc-mono">{moduleText.title}</span>
                    <span>{moduleText.desc}</span>
                  </div>
                )}
              </section>

              <section className="wc-card">
                <header>
                  <h3>Autonomous Mars-transit logic</h3>
                  <span className="wc-tag">OFFLINE</span>
                </header>
                <ul className="wc-rows">
                  <li>
                    <b>{commsDelayMin} min</b>
                    <span>one-way Earth delay (~{commsDelayMin * 2} min round trip), so medical triage starts on board.</span>
                  </li>
                  <li>
                    <b>100% local</b>
                    <span>Rust core persistence &amp; deterministic physiology rules. Zero external network, cloud, or AI calls.</span>
                  </li>
                  <li>
                    <b>7 crew slots</b>
                    <span>Up to 7 saved crew profiles (ISS expedition complement; NASA Mars DRA 5.0 baseline is 6).</span>
                  </li>
                </ul>
              </section>

              <section className="wc-card">
                <header>
                  <h3>Scientific honesty ledger</h3>
                  <span className="wc-tag">3 bases</span>
                </header>
                <ul className="wc-ledger">
                  <li>
                    <span className="wc-b" data-basis="nasa">NASA</span>
                    <span>NASA-STD-3001 Vol 2: ppCO₂ ≤ 3.0 mmHg [V2 6004], 3,035 + 200×EVA kcal [V2 7003/7004], 2.5 L + 240 mL/EVA h water [V2 6109/11030].</span>
                  </li>
                  <li>
                    <span className="wc-b" data-basis="mixed">MIXED</span>
                    <span>NASA reference combined with an operational watch band (e.g. NASA Ames ≥ 7 h sleep consensus + local cut-off).</span>
                  </li>
                  <li>
                    <span className="wc-b" data-basis="illustrative">ILLUSTRATIVE</span>
                    <span>Workout presets, 78-day score weights, correlations, and astronaut reference HR/BP defaults.</span>
                  </li>
                </ul>
              </section>
            </div>

            {err && <div className="wc-errors wc-errbox">{err}</div>}

            <footer className="wc-foot">
              <button type="button" className="wc-btn" disabled={busy} onClick={() => setPhase("baseline")}>
                Back to baseline
              </button>
              <button
                type="button"
                className="wc-btn wc-btn-mono-primary"
                disabled={busy}
                onClick={async () => {
                  if (await persistCurrent(true)) onClose();
                }}
              >
                {busy ? "Saving…" : "Enter Flight Deck"}
              </button>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}