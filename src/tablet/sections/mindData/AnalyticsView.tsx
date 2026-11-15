import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Lang } from "../../../i18n";
import type {
  CorrelationMetric,
  CorrelationPair,
  MindAnalytics,
  MoodPoint,
  Sentiment,
} from "../../../types";
import { TABLET_I18N } from "../../tabletI18n";

interface Props {
  lang: Lang;
}

function fmtOpt(v: number | null | undefined, digits = 1, unit = ""): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)}${unit}`;
}

function fmtMetricVal(v: number, unit: string): string {
  const txt = v.toFixed(1);
  return unit === "%" ? `${txt}%` : `${txt} ${unit}`;
}

function fmtMetricDelta(m: CorrelationMetric): string {
  const sign = m.delta > 0 ? "+" : "";
  const txt = `${sign}${m.delta.toFixed(1)}`;
  return m.unit === "%" ? `${txt}%` : `${txt} ${m.unit}`;
}

function deltaTone(m: CorrelationMetric): "bad" | "good" | "flat" {
  if (Math.abs(m.delta) < 0.05) return "flat";
  const isBad = (m.delta > 0 && m.higherIsBad) || (m.delta < 0 && !m.higherIsBad);
  return isBad ? "bad" : "good";
}

function Sparkline({
  series,
  legend,
  emptyLabel,
}: {
  series: MoodPoint[];
  legend: { mood: string; stress: string; shift: string };
  emptyLabel: string;
}) {
  const validCount = series.filter((p) => p.mood != null || p.stress != null).length;
  if (validCount < 2) {
    return <div className="an-empty">{emptyLabel}</div>;
  }

  const w = 304;
  const h = 116;
  const padL = 18;
  const padR = 8;
  const padT = 10;
  const padB = 20;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const xFor = (idx: number) =>
    series.length <= 1 ? padL + plotW / 2 : padL + (idx / (series.length - 1)) * plotW;
  const yFor = (val: number) => {
    const clamped = Math.max(1, Math.min(5, val));
    return padT + ((5 - clamped) / 4) * plotH;
  };

  const moodPts: { x: number; y: number; shift: boolean; day: number }[] = [];
  const stressPts: { x: number; y: number; day: number }[] = [];

  series.forEach((p, i) => {
    const x = xFor(i);
    if (p.mood != null) {
      moodPts.push({ x, y: yFor(p.mood), shift: p.isShift, day: p.day });
    }
    if (p.stress != null) {
      stressPts.push({ x, y: yFor(p.stress), day: p.day });
    }
  });

  const moodLine = moodPts.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ");
  const stressLine = stressPts.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ");
  const firstDay = series[0]?.day ?? 1;
  const lastDay = series[series.length - 1]?.day ?? firstDay;

  return (
    <div className="an-spark-wrap">
      <div className="an-spark-legend">
        <span className="an-leg-item">
          <span className="an-leg-swatch an-swatch-mood" />
          {legend.mood}
        </span>
        <span className="an-leg-item">
          <span className="an-leg-swatch an-swatch-stress" />
          {legend.stress}
        </span>
        <span className="an-leg-item">
          <span className="an-leg-dot-shift" />
          {legend.shift}
        </span>
      </div>

      <svg className="an-spark-svg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Mood and stress trajectory">
        {[1, 2, 3, 4, 5].map((tick) => {
          const y = yFor(tick);
          return (
            <g key={tick}>
              <line x1={padL} y1={y} x2={w - padR} y2={y} className="an-grid-line" />
              {tick === 1 || tick === 3 || tick === 5 ? (
                <text x={4} y={y + 3} className="an-axis-text">
                  {tick}
                </text>
              ) : null}
            </g>
          );
        })}

        {stressPts.length >= 2 && (
          <polyline fill="none" points={stressLine} className="an-line-stress" />
        )}
        {moodPts.length >= 2 && (
          <polyline fill="none" points={moodLine} className="an-line-mood" />
        )}

        {stressPts.map((pt) => (
          <circle key={`s-${pt.day}`} cx={pt.x} cy={pt.y} r={2.1} className="an-pt-stress" />
        ))}
        {moodPts.map((pt) => (
          <g key={`m-${pt.day}`}>
            {pt.shift && <circle cx={pt.x} cy={pt.y} r={5} className="an-pt-shift-ring" />}
            <circle
              cx={pt.x}
              cy={pt.y}
              r={pt.shift ? 3 : 2.3}
              className={pt.shift ? "an-pt-shift" : "an-pt-mood"}
            />
          </g>
        ))}

        <text x={padL} y={h - 4} className="an-axis-text">
          {`D${String(firstDay).padStart(2, "0")}`}
        </text>
        <text x={w - padR} y={h - 4} textAnchor="end" className="an-axis-text">
          {`D${String(lastDay).padStart(2, "0")}`}
        </text>
      </svg>
    </div>
  );
}

function CorrelationCard({
  pair,
  lang,
}: {
  pair: CorrelationPair;
  lang: Lang;
}) {
  const A = TABLET_I18N[lang].mindData.analytics;
  const copy = A.corrPairs[pair.id] ?? {
    title: pair.id,
    cohortA: "A",
    cohortB: "B",
    note: "",
  };

  const metrics = [pair.metric1, pair.metric2].filter(
    (m): m is CorrelationMetric => m !== null,
  );

  return (
    <div className="an-corr-card" data-basis={pair.basis}>
      <div className="an-corr-head">
        <span className="an-corr-title">{copy.title}</span>
        <span className="an-basis-tag">{A.basisIllustrative}</span>
      </div>

      <div className="an-corr-cohorts">
        <span>
          {copy.cohortA} <b>vs</b> {copy.cohortB}
        </span>
        <span className="an-corr-n">{A.corrCohortSample(pair.nA, pair.nB)}</span>
      </div>

      {!pair.available || metrics.length === 0 ? (
        <div className="an-corr-unavail">{A.corrInsufficient}</div>
      ) : (
        <div className="an-corr-metrics">
          {metrics.map((m) => {
            const tone = deltaTone(m);
            return (
              <div key={m.key} className="an-corr-row">
                <span className="an-corr-mname">{A.corrMetrics[m.key] ?? m.key}</span>
                <span className="an-corr-vals">
                  {fmtMetricVal(m.cohortA, m.unit)} <span className="an-vs">/</span>{" "}
                  {fmtMetricVal(m.cohortB, m.unit)}
                </span>
                <span className={`an-delta an-delta-${tone}`}>{fmtMetricDelta(m)}</span>
              </div>
            );
          })}
        </div>
      )}

      {copy.note && <div className="an-corr-note">{copy.note}</div>}
    </div>
  );
}

export function AnalyticsView({ lang }: Props) {
  const T = TABLET_I18N[lang].mindData;
  const A = T.analytics;

  const [data, setData] = useState<MindAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    invoke<MindAnalytics>("get_mind_analytics")
      .then((res) => {
        if (!alive) return;
        setData(res);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(String(e));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return <div className="md-loading">{A.loading}</div>;
  }
  if (err) {
    return <div className="tb-warn-box tb-err">{err}</div>;
  }
  if (!data) {
    return null;
  }

  const { coverage, sentiments, correlations } = data;
  const sortedThemes = [...data.themes].sort(
    (a, b) => b.count - a.count || a.id.localeCompare(b.id),
  );
  const sentimentTotal =
    sentiments.positive + sentiments.mixed + sentiments.negative + sentiments.neutral;
  const sentimentList: { key: Sentiment; count: number }[] = [
    { key: "positive", count: sentiments.positive },
    { key: "mixed", count: sentiments.mixed },
    { key: "negative", count: sentiments.negative },
    { key: "neutral", count: sentiments.neutral },
  ];

  return (
    <div className="an-root">
      {/* Coverage & Baseline */}
      <section className="an-card">
        <div className="an-card-head">
          <span className="an-card-title">{A.coverageTitle}</span>
          <span className="an-card-badge">
            {A.loggedValue(coverage.loggedDays, coverage.totalDays)}
          </span>
        </div>

        <div className="an-source-pills">
          {coverage.sampleDays > 0 && (
            <span className="an-src-tag an-src-sample">{A.sampleTag(coverage.sampleDays)}</span>
          )}
          {coverage.manualDays > 0 && (
            <span className="an-src-tag">{A.manualTag(coverage.manualDays)}</span>
          )}
          {coverage.checkinDays > 0 && (
            <span className="an-src-tag">{A.checkinTag(coverage.checkinDays)}</span>
          )}
          {coverage.importDays > 0 && (
            <span className="an-src-tag">{A.importTag(coverage.importDays)}</span>
          )}
        </div>

        <div className="an-kpi-grid">
          <div className="an-kpi">
            <span className="an-kpi-label">{A.avgMood}</span>
            <span className="an-kpi-val">{fmtOpt(coverage.avgMood, 1, "/5")}</span>
          </div>
          <div className="an-kpi">
            <span className="an-kpi-label">{A.avgStress}</span>
            <span className="an-kpi-val">{fmtOpt(coverage.avgStress, 1, "/5")}</span>
          </div>
          <div className="an-kpi">
            <span className="an-kpi-label">{A.avgSleep}</span>
            <span className="an-kpi-val">{fmtOpt(coverage.avgSleep, 1, " h")}</span>
          </div>
          <div className="an-kpi">
            <span className="an-kpi-label">{A.volatility}</span>
            <span className="an-kpi-val">
              {fmtOpt(data.moodVolatility, 2)} / {fmtOpt(data.stressVolatility, 2)}
            </span>
          </div>
        </div>
      </section>

      {/* Trajectory Sparkline + Sharp Shifts */}
      <section className="an-card">
        <div className="an-card-head">
          <span className="an-card-title">{A.sparkTitle}</span>
        </div>
        <Sparkline series={data.series} legend={A.legend} emptyLabel={A.noSeries} />

        <div className="an-subhead">{A.shiftsTitle}</div>
        {data.shifts.length === 0 ? (
          <div className="an-empty">{A.noShifts}</div>
        ) : (
          <ul className="an-shifts">
            {data.shifts.map((s) => (
              <li key={`${s.fromDay}-${s.toDay}`} className="an-shift-row">
                <span className="an-shift-days">{A.shiftRow(s.fromDay, s.toDay)}</span>
                <span className="an-shift-deltas">
                  {s.deltaMood != null && Math.abs(s.deltaMood) >= 2 && (
                    <span className={s.deltaMood < 0 ? "an-delta-bad" : "an-delta-good"}>
                      {`${T.mood} ${s.deltaMood > 0 ? "+" : ""}${s.deltaMood}`}
                    </span>
                  )}
                  {s.deltaStress != null && Math.abs(s.deltaStress) >= 2 && (
                    <span className={s.deltaStress > 0 ? "an-delta-bad" : "an-delta-good"}>
                      {`${T.stress} ${s.deltaStress > 0 ? "+" : ""}${s.deltaStress}`}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Thought Themes & Sentiment */}
      <section className="an-card">
        <div className="an-card-head">
          <span className="an-card-title">{A.themesTitle}</span>
        </div>
        {sortedThemes.length === 0 ? (
          <div className="an-empty">{A.noThemes}</div>
        ) : (
          <div className="an-themes">
            {sortedThemes.map((th) => (
              <div key={th.id} className="an-theme-row">
                <div className="an-theme-meta">
                  <span className="an-theme-name">{T.themes[th.id] ?? th.id}</span>
                  <span className="an-theme-count">
                    {th.count} ({th.pct.toFixed(0)}%)
                  </span>
                </div>
                <div className="an-bar-track">
                  <div
                    className="an-bar-fill"
                    style={{ width: `${Math.max(4, Math.min(100, th.pct))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {sentimentTotal > 0 && (
          <>
            <div className="an-subhead">{A.sentimentTitle}</div>
            <div className="an-sentiments">
              {sentimentList.map((s) => (
                <div key={s.key} className={`an-sent-item an-sent-${s.key}`}>
                  <span className="an-sent-label">{T.sentiments[s.key]}</span>
                  <span className="an-sent-val">{s.count}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Mind <-> Body Correlations */}
      <section className="an-card">
        <div className="an-card-head">
          <span className="an-card-title">{A.corrTitle}</span>
          <span className="an-basis-tag">{A.basisIllustrative}</span>
        </div>
        <div className="an-corr-list">
          {correlations.map((pair) => (
            <CorrelationCard key={pair.id} pair={pair} lang={lang} />
          ))}
        </div>
      </section>

      <p className="an-disclaimer">{A.disclaimer}</p>
    </div>
  );
}