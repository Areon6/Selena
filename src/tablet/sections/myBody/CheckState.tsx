import { I18N } from "../../../i18n";
import { computeMetrics } from "../../../bodyParams";
import { SOURCES, CHECKED } from "../../../sources";
import type { Level } from "../../../types";
import { TABLET_I18N } from "../../tabletI18n";
import type { ModuleProps } from "../../types";
import { assessProfile, SPINE_GROWTH_MAX } from "./assess";

const ORDER: Record<Level, number> = { nominal: 0, watch: 1, critical: 2 };

/** NASA-STD-3001 Vol 2 [V2 7003]: average crew energy requirement. A reference value, not a personal one. */
const ENERGY_REF_KCAL = 3035;
/** NASA-STD-3001 Vol 2 [V2 7004]: extra energy per EVA hour. */
const EVA_EXTRA_KCAL = 200;

function Sources({ ids, label }: { ids: string[]; label: string }) {
  return (
    <div className="src" style={{ marginTop: 8, paddingTop: 8 }}>
      <div className="eyebrow">{label}</div>
      <ul>
        {ids.map((id) =>
          SOURCES[id] ? (
            <li key={id}>
              {SOURCES[id].title}
              <span>{SOURCES[id].url}</span>
            </li>
          ) : null,
        )}
      </ul>
    </div>
  );
}

export function CheckState({ lang, report, body }: ModuleProps) {
  const T = TABLET_I18N[lang].body;
  const L = I18N[lang].levels as Record<Level, string>;
  const B = I18N[lang].basis;
  const p = body.saved; // the check always reflects the PERSISTED profile
  const m = computeMetrics(p);
  const factors = assessProfile(p);

  // Overall status comes from the zones only. Body metrics are informational and never change it.
  const overall = report.zones
    .map((z) => z.level)
    .concat(factors.map((f) => f.level))
    .reduce<Level>((a, b) => (ORDER[b] > ORDER[a] ? b : a), "nominal");

  const spineCm = (p.heightCm * SPINE_GROWTH_MAX).toFixed(1);

  return (
    <div className="tb-module">
      {body.dirty && <div className="tb-warn-box">{T.checkDirty}</div>}

      <div className="tb-group" data-level={overall}>
        <div className="eyebrow">{T.checkOverall}</div>
        <div className="tb-overall">
          <span className="dot" /> {L[overall]}
        </div>
      </div>

      <div className="tb-group">
        <div className="eyebrow">{T.anthro}</div>
        <dl className="tb-kv">
          <dt>{T.bmi}</dt>
          <dd>
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
          <dt>{T.bmr}</dt>
          <dd>{m.bmrKcal.toFixed(0)} kcal/d</dd>
          <dt>{T.energyRef}</dt>
          <dd>{ENERGY_REF_KCAL} kcal/d</dd>
          <dt>{T.evaExtra}</dt>
          <dd>+{EVA_EXTRA_KCAL} kcal/h</dd>
        </dl>
        <div className="tb-dim">{T.bmiNote}</div>
        <Sources ids={["std-nutrition"]} label={`${T.source} · ${B.nasa}`} />
      </div>

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
                        {(T.factors[f.key] ?? f.key).replace("{cm}", spineCm)}
                      </li>
                    ))}
                  </ul>
                )}
                <Sources ids={z.sources} label={`${T.source} · ${B[z.basis]}`} />
              </li>
            );
          })}
        </ul>
        <div className="tb-dim">
          {T.checked} {CHECKED}
        </div>
      </div>

      <p className="tb-foot">{T.checkDisclaimer}</p>
    </div>
  );
}