import { useState } from "react";
import type { BodyProfile, Sex } from "../../../types";
import { PROFILE_LIMITS, plausibilityWarnings } from "../../../bodyParams";
import { TABLET_I18N } from "../../tabletI18n";
import type { ModuleProps } from "../../types";

type NumKey = Exclude<keyof BodyProfile, "sex">;
const FIELDS: { key: NumKey; unit: string; digits: number; pct?: boolean }[] = [
  { key: "heightCm", unit: "cm", digits: 0 },
  { key: "weightKg", unit: "kg", digits: 1 },
  { key: "bodyFatPct", unit: "%", digits: 1 },
  { key: "muscularity", unit: "", digits: 2, pct: true },
  { key: "shoulderWidth", unit: "×", digits: 2 },
  { key: "waist", unit: "×", digits: 2 },
  { key: "hips", unit: "×", digits: 2 },
];
const SEXES: Sex[] = ["neutral", "male", "female"];

function Field(props: {
  label: string;
  unit: string;
  value: number;
  digits: number;
  limits: { min: number; max: number; step: number };
  onChange: (v: number) => void;
  onCommit: () => void;
}) {
  const { limits: L } = props;
  const [txt, setTxt] = useState<string | null>(null);
  const shown = txt ?? props.value.toFixed(props.digits);
  const pct = ((props.value - L.min) / (L.max - L.min)) * 100;

  return (
    <div className="tb-field">
      <div className="tb-field-head">
        <span className="tb-label">{props.label}</span>
        <span className="tb-numwrap">
          <input
            className="tb-num"
            inputMode="decimal"
            value={shown}
            onChange={(e) => {
              setTxt(e.target.value);
              const v = parseFloat(e.target.value.replace(",", "."));
              if (Number.isFinite(v) && v >= L.min && v <= L.max) props.onChange(v);
            }}
            onBlur={() => {
              const v = parseFloat((txt ?? "").replace(",", "."));
              if (Number.isFinite(v)) props.onChange(Math.min(L.max, Math.max(L.min, v)));
              setTxt(null);
              props.onCommit();
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
          <span className="tb-unit">{props.unit}</span>
        </span>
      </div>
      <input
        className="tb-range"
        type="range"
        min={L.min}
        max={L.max}
        step={L.step}
        value={props.value}
        style={{ ["--p" as string]: `${pct}%` }}
        onChange={(e) => {
          setTxt(null);
          props.onChange(parseFloat(e.target.value));
        }}
        onPointerUp={props.onCommit}
        onKeyUp={props.onCommit}
        onBlur={props.onCommit}
      />
    </div>
  );
}

export function EnterParams({ lang, body }: ModuleProps) {
  const T = TABLET_I18N[lang].body;
  const { draft, metrics: m } = body;
  const warnings = plausibilityWarnings(draft);

  return (
    <div className="tb-module">
      <div className="tb-group">
        <div className="eyebrow">{T.sex}</div>
        <div className="tb-seg">
          {SEXES.map((s) => (
            <button
              key={s}
              data-active={draft.sex === s}
              onClick={() => {
                body.setDraft({ sex: s });
                body.commitGeometry();
              }}
            >
              {T.sexOpts[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="tb-group">
        {FIELDS.map((f) => (
          <Field
            key={f.key}
            label={T.fields[f.key]}
            unit={f.unit}
            digits={f.digits}
            value={draft[f.key]}
            limits={PROFILE_LIMITS[f.key]}
            onChange={(v) => body.setDraft({ [f.key]: v })}
            onCommit={body.commitGeometry}
          />
        ))}
      </div>

      <div className="tb-group">
        <div className="eyebrow">{T.derived}</div>
        <dl className="tb-kv">
          <dt>{T.bmi}</dt>
          <dd>
            {m.bmi.toFixed(1)} · {T.categories[m.bmiCategory]}
          </dd>
          <dt>{T.bsa}</dt>
          <dd>
            {m.bsaMosteller.toFixed(2)} m² <span className="tb-dim">(Du Bois {m.bsaDuBois.toFixed(2)})</span>
          </dd>
          <dt>{T.fatMass}</dt>
          <dd>{m.fatMassKg.toFixed(1)} kg</dd>
          <dt>{T.leanMass}</dt>
          <dd>{m.leanMassKg.toFixed(1)} kg</dd>
          <dt>{T.ffmi}</dt>
          <dd>{m.ffmi.toFixed(1)}</dd>
          <dt>{T.bmr}</dt>
          <dd>{m.bmrKcal.toFixed(0)} kcal/d</dd>
        </dl>
      </div>

      {warnings.length > 0 && (
        <ul className="tb-warn">
          {warnings.map((w) => (
            <li key={w}>{T.warnings[w] ?? w}</li>
          ))}
        </ul>
      )}

      <div className="tb-status" data-dirty={body.dirty}>
        <span className="tb-dotmark" /> {body.dirty ? T.unsaved : T.saved}
      </div>

      <div className="tb-actions">
        <button className="btn" onClick={() => void body.apply()} disabled={!body.dirty || body.busy}>
          {body.busy ? T.applying : T.apply}
        </button>
        <button className="btn" onClick={body.revert} disabled={!body.dirty || body.busy}>
          {T.cancel}
        </button>
        <button className="btn" onClick={() => void body.resetToDefault()} disabled={body.busy}>
          {T.defaults}
        </button>
      </div>
      <p className="tb-foot">{T.hint}</p>
    </div>
  );
}