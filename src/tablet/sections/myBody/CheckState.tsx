import { I18N } from "../../../i18n";
import { computeMetrics } from "../../../bodyParams";
import type { Level } from "../../../types";
import { TABLET_I18N } from "../../tabletI18n";
import type { ModuleProps } from "../../types";
import { assessProfile, bmiLevel } from "./assess";

const ORDER: Record<Level, number> = { nominal: 0, watch: 1, critical: 2 };

export function CheckState({ lang, report, body }: ModuleProps) {
  const T = TABLET_I18N[lang].body;
  const L = I18N[lang].levels as Record<Level, string>;
  const p = body.saved; // the check always reflects the PERSISTED profile
  const m = computeMetrics(p);
  const factors = assessProfile(p, m);
  const bmiLv = bmiLevel(m);
  const overall = [bmiLv, ...report.zones.map((z) => z.level), ...factors.map((f) => f.level)].reduce<Level>(
    (a, b) => (ORDER[b] > ORDER[a] ? b : a),
    "nominal",
  );

  return (
    <div className="tb-module">
      {body.dirty && <div className="tb-warn-box">{T.checkDirty}</div>}

      <div className="tb-group" data-level={overall}>
        <div className="eyebrow">{T.checkOverall}</div>
        <div className="tb-overall">
          <span className="dot" /> {L[overall]}
        </div>
      </div>

      {(
        <div className="tb-group" data-level={bmiLv}>
          <div className="eyebrow">{T.anthro}</div>
          <dl className="tb-kv">
            <dt>{T.bmi}</dt>
            <dd className="tb-lv">
              {m.bmi.toFixed(1)} · {T.categories[m.bmiCategory]}
            </dd>
            <dt>{T.bsa}</dt>
            <dd>{m.bsaMosteller.toFixed(2)} m²</dd>
            <dt>{T.fatMass}</dt>
            <dd>
              {m.fatMassKg.toFixed(1)} kg ({p.bodyFatPct.toFixed(1)} %)
            </dd>
            <dt>{T.ffmi}</dt>
            <dd>{m.ffmi.toFixed(1)}</dd>
          </dl>
        </div>
      )}

      <div className="tb-group">
        <div className="eyebrow">{T.zonesTitle}</div>
        <ul className="tb-zones">
          {report.zones.map((z) => {
            const own = factors.filter((f) => f.zone === z.id);
            return (
              <li key={z.id} data-level={z.level}>
                <div className="tb-zone-head">
                  <span className="dot" />
                  <b>{I18N[lang].zones[z.id]?.name ?? z.name}</b>
                  <span className="tb-zone-state">{L[z.level]}</span>
                </div>
                <div className="tb-dim">{z.metric}</div>
                {own.length === 0 ? (
                  <div className="tb-dim">{T.noFactors}</div>
                ) : (
                  <ul className="tb-factors">
                    {own.map((f) => (
                      <li key={f.key} data-level={f.level}>
                        {T.factors[f.key] ?? f.key}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <p className="tb-foot">{T.checkDisclaimer}</p>
    </div>
  );
}