import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TABLET_I18N, type TabletTexts } from "../../tabletI18n";
import type { ModuleProps } from "../../types";

type T = TabletTexts["checkin"];

const agoText = (s: number, T: T) => (s < 60 ? T.justNow : T.ago(Math.round(s / 60)));
const num = (s: string) => parseFloat(s.replace(",", "."));

/** Shared submit: calls a Rust command, shows its error. The report refreshes on App's next 1 s poll. */
function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (cmd: string, args: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    setErr(null);
    try {
      await invoke(cmd, args);
      return true;
    } catch (e) {
      setErr(String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, err, submit };
}

export function SleepMood({ lang, report }: ModuleProps) {
  const T = TABLET_I18N[lang].checkin;
  const [hours, setHours] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const { busy, err, submit } = useSubmit();

  const h = num(hours);
  const valid = Number.isFinite(h) && h >= 0 && h <= 16 && mood !== null;
  const last = report.lastSleep;

  return (
    <div className="tb-module">
      <div className="tb-group">
        <div className="tb-field">
          <div className="tb-field-head">
            <span className="tb-label">{T.sleepHours}</span>
            <span className="tb-numwrap">
              <input
                className="tb-num"
                inputMode="decimal"
                placeholder="0–16"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
              <span className="tb-unit">h</span>
            </span>
          </div>
        </div>

        <div className="tb-field">
          <span className="tb-label">{T.mood}</span>
          <div className="tb-seg tb-seg5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} data-active={mood === n} onClick={() => setMood(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="tb-actions" style={{ gridTemplateColumns: "1fr" }}>
        <button
          className="btn"
          disabled={!valid || busy}
          onClick={async () => {
            if (await submit("log_sleep", { hours: h, mood })) {
              setHours("");
              setMood(null);
            }
          }}
        >
          {busy ? T.saving : T.save}
        </button>
      </div>
      {err && <div className="tb-warn-box tb-err">{err}</div>}

      <div className="tb-group">
        <div className="eyebrow">{T.last}</div>
        {last ? (
          <div className="tb-dim">
            {last.hours.toFixed(1)} h · {T.mood.toLowerCase()} {last.mood}/5 · {agoText(last.agoS, T)}
          </div>
        ) : (
          <div className="tb-dim">{T.none}</div>
        )}
      </div>
      <p className="tb-foot">{T.hint}</p>
    </div>
  );
}

export function BloodPressure({ lang, report }: ModuleProps) {
  const T = TABLET_I18N[lang].checkin;
  const [sys, setSys] = useState("");
  const [dia, setDia] = useState("");
  const [pulse, setPulse] = useState("");
  const { busy, err, submit } = useSubmit();

  const s = num(sys);
  const d = num(dia);
  const p = num(pulse);
  const inRange = (v: number, lo: number, hi: number) => Number.isFinite(v) && v >= lo && v <= hi;
  const valid = inRange(s, 70, 260) && inRange(d, 40, 160) && inRange(p, 30, 220) && s > d;
  const last = report.lastBp;

  const row = (label: string, unit: string, value: string, set: (v: string) => void) => (
    <div className="tb-field">
      <div className="tb-field-head">
        <span className="tb-label">{label}</span>
        <span className="tb-numwrap">
          <input className="tb-num" inputMode="numeric" value={value} onChange={(e) => set(e.target.value)} />
          <span className="tb-unit">{unit}</span>
        </span>
      </div>
    </div>
  );

  return (
    <div className="tb-module">
      <div className="tb-group">
        {row(T.systolic, "mmHg", sys, setSys)}
        {row(T.diastolic, "mmHg", dia, setDia)}
        {row(T.pulse, "bpm", pulse, setPulse)}
      </div>

      <div className="tb-actions" style={{ gridTemplateColumns: "1fr" }}>
        <button
          className="btn"
          disabled={!valid || busy}
          onClick={async () => {
            if (await submit("log_bp", { systolic: s, diastolic: d, pulse: p })) {
              setSys("");
              setDia("");
              setPulse("");
            }
          }}
        >
          {busy ? T.saving : T.save}
        </button>
      </div>
      {err && <div className="tb-warn-box tb-err">{err}</div>}

      <div className="tb-group">
        <div className="eyebrow">{T.last}</div>
        {last ? (
          <div className="tb-dim">
            {last.systolic.toFixed(0)}/{last.diastolic.toFixed(0)} mmHg · {last.pulse.toFixed(0)} bpm ·{" "}
            {agoText(last.agoS, T)}
          </div>
        ) : (
          <div className="tb-dim">{T.none}</div>
        )}
      </div>
      <p className="tb-foot">{T.hint}</p>
    </div>
  );
}