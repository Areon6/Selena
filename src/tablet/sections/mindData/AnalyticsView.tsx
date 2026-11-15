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

  const w = 312;
  const h = 112;
  const padL = 16;
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

  const moodPts: { x: number; y: number; shift: boolean; day: number; val: number }[] = [];
  const stressPts: { x: number; y: number; day: number; val: number }[] = [];

  series.forEach((p, i) => {
    const x = xFor(i);
    if (p.mood != null) {
      moodPts.push({ x, y: yFor(p.mood), shift: p.isShift, day: p.day, val: p.mood });
    }
    if (p.stress != null) {
      stressPts.push({ x, y: yFor(p.stress), day: p.day, val: p.stress });
    }
  });

  const moodLine = moodPts.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ");
  const stressLine = stressPts.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ");
  const moodArea =
    moodPts.length >= 2
      ? `M${moodPts[0].x.toFixed(1)},${(padT + plotH).toFixed(1)} L${moodLine.replace(/ /g, " L")} L${moodPts[moodPts.length - 1].x.toFixed(1)},${(padT + plotH).toFixed(1)} Z`
      : "";

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
        <defs>
          <linearGradient id="anMoodGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[1, 2, 3, 4, 5].map((tick) => {
          const y = yFor(tick);
          return (
            <g key={tick}>
              <line x1={padL} y1={y} x2={w - padR} y2={y} className="an-grid-line" />
              {tick === 1 || tick === 3 || tick === 5 ? (
                <text x={3} y={y + 3} className="an-axis-text">
                  {tick}
                </text>
              ) : null}
            </g>
          );
        })}

        {moodArea && <path d={moodArea} fill="url(#anMoodGrad)" />}
        {stressPts.length >= 2 && (
          <polyline fill="none" points={stressLine} className="an-line-stress" />
        )}
        {moodPts.length >= 2 && (
          <polyline fill="none" points={moodLine} className="an-line-mood" />
        )}

        {stressPts.map((pt) => (
          <circle key={`s-${pt.day}`} cx={pt.x} cy={pt.y} r={2} className="an-pt-stress">
            <title>{`D${pt.day} · Stress ${pt.val}/5`}</title>
          </circle>
        ))}
        {moodPts.map((pt) => (
          <g key={`m-${pt.day}`}>
            {pt.shift && <circle cx={pt.x} cy={pt.y} r={4.8} className="an-pt-shift-ring" />}
            <circle
              cx={pt.x}
              cy={pt.y}
              r={pt.shift ? 2.8 : 2.2}
              className={pt.shift ? "an-pt-shift" : "an-pt-mood"}
            >
              <title>{`D${pt.day} · Mood ${pt.val}/5`}</title>
            </circle>
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

function CorrelationRow({
  pair,
  lang,
}: {
  pair: CorrelationPair;
  lang: Lang;
}) {
  const A = TABLET_I18N[lang].mindData.analytics;
  const copy = A.corrPairs[pair.id] ?? { title: pair.id, cohorts: "" };

  const metrics = [pair.metric1, pair.metric2].filter(
    (m): m is CorrelationMetric => m !== null,
  );

  return (
    <div className="an-corr-item" data-basis={pair.basis}>
      <div className="an-corr-top">
        <span className="an-corr-title">{copy.title}</span>
        <span className="an-corr-n">{A.corrCohortSample(pair.nA, pair.nB)}</span>
      </div>
      {copy.cohorts && <div className="an-corr-sub">{copy.cohorts}</div>}

      {!pair.available || metrics.length === 0 ? (
        <div className="an-corr-unavail">{A.corrInsufficient}</div>
      ) : (
        <div className="an-corr-metrics">
          {metrics.map((m) => {
            const tone = deltaTone(m);
            return (
              <div key={m.key} className="an-corr-metric">
                <span className="an-corr-mname">{A.corrMetrics[m.key] ?? m.key}</span>
                <span className="an-corr-vals">
                  {fmtMetricVal(m.cohortA, m.unit)} <span className="an-vs">vs</span>{" "}
                  {fmtMetricVal(m.cohortB, m.unit)}
                </span>
                <span className={`an-delta an-delta-${tone}`}>{fmtMetricDelta(m)}</span>
              </div>
            );
          })}
        </div>
      )}
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

  if (loading) return <div className="md-loading">{A.loading}</div>;
  if (err) return <div className="tb-warn-box tb-err">{err}</div>;
  if (!data) return null;

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
      <section className="an-section an-section-first">
        <div className="an-sec-head">
          <span className="an-sec-title">{A.coverageTitle}</span>
          <span className="an-sec-badge">
            {A.loggedValue(coverage.loggedDays, coverage.totalDays)}
          </span>
        </div>

        <div className="an-sources">
          {coverage.sampleDays > 0 && (
            <span className="an-src-chip an-src-sample">{A.sampleTag(coverage.sampleDays)}</span>
          )}
          {coverage.manualDays > 0 && (
            <span className="an-src-chip">{A.manualTag(coverage.manualDays)}</span>
          )}
          {coverage.checkinDays > 0 && (
            <span className="an-src-chip">{A.checkinTag(coverage.checkinDays)}</span>
          )}
          {coverage.importDays > 0 && (
            <span className="an-src-chip">{A.importTag(coverage.importDays)}</span>
          )}
        </div>

        <div className="an-kpi-row">
          <div className="an-kpi">
            <span className="an-kpi-val">{fmtOpt(coverage.avgMood, 1)}</span>
            <span className="an-kpi-label">{A.avgMood} /5</span>
          </div>
          <div className="an-kpi">
            <span className="an-kpi-val">{fmtOpt(coverage.avgStress, 1)}</span>
            <span className="an-kpi-label">{A.avgStress} /5</span>
          </div>
          <div className="an-kpi">
            <span className="an-kpi-val">{fmtOpt(coverage.avgSleep, 1, "h")}</span>
            <span className="an-kpi-label">{A.avgSleep}</span>
          </div>
          <div className="an-kpi">
            <span className="an-kpi-val">
              {fmtOpt(data.moodVolatility, 2)}
            </span>
            <span className="an-kpi-label">{A.volatility}</span>
          </div>
        </div>
      </section>

      {/* Trajectory Sparkline + Sharp Shifts */}
      <section className="an-section">
        <div className="an-sec-head">
          <span className="an-sec-title">{A.sparkTitle}</span>
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
      <section className="an-section">
        <div className="an-sec-head">
          <span className="an-sec-title">{A.themesTitle}</span>
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
                    {th.count} · {th.pct.toFixed(0)}%
                  </span>
                </div>
                <div className="an-bar-track">
                  <div
                    className="an-bar-fill"
                    style={{ width: `${Math.max(3, Math.min(100, th.pct))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {sentimentTotal > 0 && (
          <div className="an-sent-wrap">
            <div className="an-subhead">{A.sentimentTitle}</div>
            <div className="an-sent-bar" aria-hidden="true">
              {sentimentList.map((s) =>
                s.count > 0 ? (
                  <span
                    key={s.key}
                    className={`an-sent-seg an-sent-seg-${s.key}`}
                    style={{ width: `${(s.count / sentimentTotal) * 100}%` }}
                  />
                ) : null,
              )}
            </div>
            <div className="an-sent-legend">
              {sentimentList.map((s) => (
                <span key={s.key} className={`an-sent-item an-sent-${s.key}`}>
                  <i className="an-sent-dot" />
                  {T.sentiments[s.key]} <b>{s.count}</b>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Mind <-> Body Correlations */}
      <section className="an-section">
        <div className="an-sec-head">
          <span className="an-sec-title">{A.corrTitle}</span>
          <span className="an-basis-tag">{A.basisIllustrative}</span>
        </div>
        <div className="an-corr-list">
          {correlations.map((pair) => (
            <CorrelationRow key={pair.id} pair={pair} lang={lang} />
          ))}
        </div>
      </section>

      <p className="an-disclaimer">{A.disclaimer}</p>
    </div>
  );
}
