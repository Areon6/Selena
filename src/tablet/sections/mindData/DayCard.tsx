import type { Lang } from "../../../i18n";
import type { DayEntry } from "../../../types";
import { TABLET_I18N } from "../../tabletI18n";

interface Props {
  lang: Lang;
  entry: DayEntry;
  onBack: () => void;
  onEdit: () => void;
}

function dots(val: number | null | undefined): string {
  if (val == null) return "—";
  const clamped = Math.max(1, Math.min(5, Math.round(val)));
  return "●".repeat(clamped) + "○".repeat(5 - clamped) + ` ${clamped}/5`;
}

export function DayCard({ lang, entry, onBack, onEdit }: Props) {
  const T = TABLET_I18N[lang].mindData;
  const level = entry.level ?? "nominal";
  const source = entry.source ?? "sample";

  const hasPsych =
    entry.mood != null ||
    entry.energy != null ||
    entry.stress != null ||
    (entry.tags != null && entry.tags.length > 0) ||
    Boolean(entry.note) ||
    (entry.themes != null && entry.themes.length > 0);

  return (
    <div className="dc-root" data-level={level}>
      <div className="dc-header">
        <span className="dc-day-label">{T.dayTitle(entry.day)}</span>
        <span className="dc-rank">{entry.rank ?? "—"}</span>
        {entry.score != null && <span className="dc-score-num">{entry.score}/100</span>}
        <span className="dc-level">{T.levels[level]}</span>
        <span className="dc-source-badge">{T.sources[source]}</span>
      </div>

      {entry.score != null && (
        <div className="dc-score">
          <div className="dc-score-head">
            <span className="dc-score-title">{T.score.title}</span>
            {entry.metricsCount != null && (
              <span className="dc-score-count">{T.score.metrics(entry.metricsCount)}</span>
            )}
          </div>
          <div className="dc-score-sub">{T.score.subtitle}</div>

          {entry.scoreFactors != null && entry.scoreFactors.length > 0 ? (
            <ul className="dc-score-list">
              {entry.scoreFactors.map((f) => (
                <li key={f.key} className="dc-score-item" data-level={f.severity}>
                  <span className="dc-score-name">{T.score.factors[f.key] ?? f.key}</span>
                  <span className="dc-score-delta">{f.delta}</span>
                  <span className="dc-score-vals">
                    {f.actual} <span className="dc-score-target">({f.target})</span>
                  </span>
                  <span className="dc-score-basis" data-basis={f.basis}>
                    {T.score.basis[f.basis] ?? f.basis}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="dc-score-ok">{T.score.allClear}</div>
          )}
          <div className="dc-score-note">{T.score.disclaimer}</div>
        </div>
      )}

      <div className="dc-section-title">{T.physioTitle}</div>
      <div className="dc-grid">
        <div className="dc-row">
          <span className="dc-label">{T.hr}</span>
          <span className="dc-val">{entry.hr != null ? `${entry.hr.toFixed(0)} bpm` : "—"}</span>
        </div>
        <div className="dc-row">
          <span className="dc-label">{T.bp}</span>
          <span className="dc-val">
            {entry.bpSys != null && entry.bpDia != null
              ? `${entry.bpSys.toFixed(0)}/${entry.bpDia.toFixed(0)} mmHg`
              : "—"}
          </span>
        </div>
        <div className="dc-row">
          <span className="dc-label">{T.spo2}</span>
          <span className="dc-val">{entry.spo2 != null ? `${entry.spo2.toFixed(1)} %` : "—"}</span>
        </div>
        <div className="dc-row">
          <span className="dc-label">{T.ppco2}</span>
          <span className="dc-val">{entry.ppco2 != null ? `${entry.ppco2.toFixed(1)} mmHg` : "—"}</span>
        </div>
        <div className="dc-row">
          <span className="dc-label">{T.sleep}</span>
          <span className="dc-val">
            {entry.sleepHours != null ? `${entry.sleepHours.toFixed(1)} h` : "—"}
          </span>
        </div>
        <div className="dc-row">
          <span className="dc-label">{T.doseRate}</span>
          <span className="dc-val">
            {entry.doseUsvH != null ? `${entry.doseUsvH.toFixed(0)} µSv/h` : "—"}
          </span>
        </div>
      </div>

      {hasPsych && (
        <>
          <div className="dc-section-title">{T.psychTitle}</div>
          <div className="dc-grid">
            <div className="dc-row">
              <span className="dc-label">{T.mood}</span>
              <span className="dc-mono">{dots(entry.mood)}</span>
            </div>
            <div className="dc-row">
              <span className="dc-label">{T.energy}</span>
              <span className="dc-mono">{dots(entry.energy)}</span>
            </div>
            <div className="dc-row">
              <span className="dc-label">{T.stress}</span>
              <span className="dc-mono">{dots(entry.stress)}</span>
            </div>
          </div>

          {entry.tags != null && entry.tags.length > 0 && (
            <div className="dc-tags">
              {entry.tags.map((id) => (
                <span key={id} className="dc-tag">
                  {T.tags[id] ?? id}
                </span>
              ))}
            </div>
          )}

          {entry.note && <div className="dc-note">{entry.note}</div>}

          {((entry.themes != null && entry.themes.length > 0) || entry.sentiment != null) && (
            <div className="dc-lex-box">
              <div className="dc-lex-head">
                <span className="dc-lex-title">{T.themesTitle}</span>
                {entry.sentiment != null && (
                  <span className={`dc-sent dc-sent-${entry.sentiment}`}>
                    {T.sentimentTitle}: {T.sentiments[entry.sentiment]}
                  </span>
                )}
              </div>
              {entry.themes != null && entry.themes.length > 0 && (
                <div className="dc-themes">
                  {entry.themes.map((th) => (
                    <span key={th} className="dc-theme">
                      {T.themes[th] ?? th}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className="dc-actions">
        <button type="button" className="md-btn md-btn-ghost" onClick={onBack}>
          {T.btnBack}
        </button>
        <button type="button" className="md-btn md-btn-primary" onClick={onEdit}>
          {T.btnEdit}
        </button>
      </div>
    </div>
  );
}