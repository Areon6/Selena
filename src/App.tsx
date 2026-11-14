import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import type { HealthReport, Level } from "./types";
import { I18N, type Lang } from "./i18n";
import { CHECKED, SOURCES } from "./sources";
import BodyModel from "./components/BodyModelV3";
import { useBodyProfile } from "./hooks/useBodyProfile";
import { Tablet } from "./tablet/Tablet";
import { TABLET_HOME, type TabletPath } from "./tablet/types";
import { TABLET_I18N } from "./tablet/tabletI18n";

const HISTORY = 90;

interface History {
  hr: number[];
  sys: number[];
  spo2: number[];
  dose: number[];
  co2: number[];
}
const EMPTY: History = { hr: [], sys: [], spo2: [], dose: [], co2: [] };
const push = (a: number[], v: number) => [...a.slice(-(HISTORY - 1)), v];

function Spark({ data, minSpan }: { data: number[]; minSpan: number }) {
  const W = 120;
  const H = 34;
  if (data.length < 2) return <svg className="spark" viewBox={`0 0 ${W} ${H}`} />;
  const lo = Math.min(...data);
  const hi = Math.max(...data);
  const span = Math.max(hi - lo, minSpan);
  const mid = (hi + lo) / 2;
  const min = mid - span / 2;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - 3 - ((v - min) / span) * (H - 6);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  const line = `M${pts.join(" L")}`;
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <path className="spark-area" d={`${line} L${W} ${H} L0 ${H} Z`} />
      <path className="spark-line" d={line} />
    </svg>
  );
}

function Cell(props: {
  label: string;
  value: string;
  unit: string;
  level: Level;
  data?: number[];
  minSpan?: number;
}) {
  return (
    <div className="cell" data-level={props.level}>
      <div className="eyebrow">{props.label}</div>
      <div className="cell-value">
        {props.value}
        {props.unit && <span className="unit">{props.unit}</span>}
      </div>
      {props.data ? <Spark data={props.data} minSpan={props.minSpan ?? 1} /> : <div className="spark" />}
    </div>
  );
}

export default function App() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [hist, setHist] = useState<History>(EMPTY);
  const [selected, setSelected] = useState("heart");
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("ru");
  const [tabletOpen, setTabletOpen] = useState(false);
  const [tabletPath, setTabletPath] = useState<TabletPath>(TABLET_HOME);
  const body = useBodyProfile(setError);

  const t = I18N[lang];

  const pull = useCallback(async () => {
    try {
      const r = await invoke<HealthReport>("get_health_report");
      setReport(r);
      setError(null);
      setHist((h) => ({
        hr: push(h.hr, r.vitals.heartRateBpm),
        sys: push(h.sys, r.vitals.systolicMmhg),
        spo2: push(h.spo2, r.vitals.spo2Pct),
        dose: push(h.dose, r.environment.doseRateUsvH),
        co2: push(h.co2, r.environment.co2Mmhg),
      }));
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const run = useCallback(async (cmd: string, args?: Record<string, unknown>) => {
    try {
      setReport(await invoke<HealthReport>(cmd, args));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    pull();
    const id = setInterval(pull, 1000);
    return () => clearInterval(id);
  }, [pull]);

  if (!report || !body.loaded) {
    return (
      <div className="boot">
        <div className="eyebrow">Selena core</div>
        <div>{error ? `Backend unreachable: ${error}` : "Starting on-board engine…"}</div>
      </div>
    );
  }

  const zone = report.zones.find((z) => z.id === selected) ?? report.zones[0];
  const localizedZone = t.zones[zone.id];
  const zoneSources = zone.sources.map((id) => SOURCES[id]).filter(Boolean);

  const radiation = report.zones.find((z) => z.id === "radiation")?.level ?? "nominal";
  const heart = report.zones.find((z) => z.id === "heart")?.level ?? "nominal";
  const lungs = report.zones.find((z) => z.id === "lungs")?.level ?? "nominal";
  const brain = report.zones.find((z) => z.id === "brain")?.level ?? "nominal";
  const environment = report.hazards.find((h) => h.id === "environment")?.level ?? "nominal";
  const v = report.vitals;
  const doneCount = report.tasks.filter((task) => task.done).length;

  return (
    <div className="app" data-level={report.level}>
      <header className="top">
        <div className="brand">
          <span className="mark" />
          <span className="wordmark">SELENA</span>
          <span className="tag">{t.systemTitle}</span>
        </div>
        <div className="top-meta">
          <div className="chip" style={{ cursor: "pointer", userSelect: "none" }}>
            <span
              onClick={() => setLang("en")}
              style={{
                color: lang === "en" ? "var(--teal)" : "var(--faint)",
                fontWeight: lang === "en" ? 700 : 400,
              }}
            >
              EN
            </span>
            <span style={{ color: "var(--line2)" }}>/</span>
            <span
              onClick={() => setLang("ru")}
              style={{
                color: lang === "ru" ? "var(--teal)" : "var(--faint)",
                fontWeight: lang === "ru" ? 700 : 400,
              }}
            >
              RU
            </span>
          </div>

          <button
            className="chip"
            onClick={() => setTabletOpen((o) => !o)}
            style={{
              cursor: "pointer",
              color: tabletOpen ? "var(--teal)" : undefined,
              borderColor: tabletOpen ? "var(--teal)" : undefined,
            }}
          >
            ▣ {TABLET_I18N[lang].open}
          </button>

          <span className="chip">
            <span className="eyebrow">{t.mission}</span> {t.day} {report.missionDay}
          </span>
          <span className="chip" data-level={report.level}>
            <span className="dot" /> {t.levels[report.level]}
          </span>
          <span className="chip">
            <span className="eyebrow">{t.mode}</span> {report.autonomous ? t.autonomous : t.linked}
          </span>
        </div>
      </header>

      {report.alerts.length > 0 && (
        <div className="alerts">
          {report.alerts.map((a) => (
            <section className="alert" key={a.id}>
              <div className="alert-head">
                <div className="eyebrow">{t.emergencyProtocol}</div>
                <h2>{a.title}</h2>
                <p>{a.summary}</p>
              </div>
              <ol className="alert-steps">
                {a.steps.map((stepText, i) => (
                  <li key={i}>
                    <span className="step-n">{String(i + 1).padStart(2, "0")}</span>
                    {stepText}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      <main className="main">
        {/* ЛЕВАЯ КОЛОНКА */}
        <aside className="col">
          <section className="panel">
            <div className="eyebrow">{t.fiveHazards}</div>
            <ul className="hazards">
              {report.hazards.map((h, i) => {
                const locHazard = t.hazards[h.id as keyof typeof t.hazards];
                return (
                  <li key={h.id} data-level={h.level}>
                    <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                    <div className="hz-body">
                      <div className="hz-name">{locHazard?.name ?? h.name}</div>
                      <div className="hz-detail">
                        {h.detail} · {t.basis[h.basis]}
                      </div>
                    </div>
                    <div className="hz-value">
                      <span className="dot" />
                      {h.value}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="panel link">
            <div className="eyebrow">{t.earthLink}</div>
            <div className="link-row">
              <span>{t.houston}</span>
              <div className="link-line">
                <i />
              </div>
              <span>{t.crew}</span>
            </div>
            <div className="link-text">{t.commsDelayText(report.commsDelayMin)}</div>
          </section>

          <section className="panel demo">
            <div className="eyebrow">{t.demoControls}</div>
            <button
              className="btn danger"
              onClick={() => run("trigger_solar_event")}
              disabled={report.scenarios.solarActive}
            >
              {t.simulateSolar}
            </button>
            <button
              className="btn danger"
              onClick={() => run("trigger_co2_failure")}
              disabled={report.scenarios.co2FailureActive}
            >
              {t.simulateCo2}
            </button>
            <button
              className="btn"
              onClick={() => run("restore_co2_scrubber")}
              disabled={!report.scenarios.co2FailureActive}
            >
              {t.restoreCo2}
            </button>
            <button className="btn" onClick={() => run("reset_scenario")}>
              {t.resetScenario}
            </button>
          </section>
        </aside>

        {/* ЦЕНТР (3D СКАНЕР ТЕЛА) */}
        <section className="col center">
          <div className="panel stage" style={{ padding: 0, overflow: "hidden" }}>
            <BodyModel
              zones={report.zones}
              selected={zone.id}
              onSelect={setSelected}
              radiationLevel={radiation}
              lang={lang}
              profile={body.geometry}
              previewProfile={body.draft}
            />
          </div>

          <div className="panel vitals">
            <Cell
              label={t.vitals.heartRate}
              value={v.heartRateBpm.toFixed(0)}
              unit="bpm"
              level={heart}
              data={hist.hr}
              minSpan={8}
            />
            <Cell
              label={t.vitals.bloodPressure}
              value={`${v.systolicMmhg.toFixed(0)}/${v.diastolicMmhg.toFixed(0)}`}
              unit="mmHg"
              level={heart}
              data={hist.sys}
              minSpan={8}
            />
            <Cell
              label={t.vitals.spo2}
              value={v.spo2Pct.toFixed(1)}
              unit="%"
              level={lungs}
              data={hist.spo2}
              minSpan={2}
            />
            <Cell
              label={t.vitals.co2}
              value={report.environment.co2Mmhg.toFixed(1)}
              unit="mmHg"
              level={environment}
              data={hist.co2}
              minSpan={0.6}
            />
            <Cell
              label={t.vitals.sleep}
              value={v.sleepHours === null ? "—" : v.sleepHours.toFixed(1)}
              unit={v.sleepHours === null ? "" : "h"}
              level={brain}
            />
            <Cell
              label={t.vitals.doseRate}
              value={report.environment.doseRateUsvH.toFixed(0)}
              unit="µSv/h"
              level={radiation}
              data={hist.dose}
              minSpan={40}
            />
          </div>
        </section>

        {/* ПРАВАЯ КОЛОНКА */}
        <aside className="col">
          <section className="panel detail" data-level={zone.level}>
            <div className="detail-head">
              <div>
                <div className="eyebrow">{t.selectedRegion}</div>
                <h3>{localizedZone?.name ?? zone.name}</h3>
              </div>
              <span className="badge">
                <span className="dot" /> {t.levels[zone.level]}
              </span>
            </div>
            <div className="metric">{zone.metric}</div>
            <p className="note">{zone.note}</p>
            {localizedZone && (
              <dl>
                <dt>{t.whyItMatters}</dt>
                <dd>{localizedZone.why}</dd>
                <dt>{t.whatToDo}</dt>
                <dd>{localizedZone.action}</dd>
              </dl>
            )}
            <div className="src">
              <div className="src-head">
                <span className="eyebrow">{t.sources}</span>
                <span className="basis" data-basis={zone.basis}>
                  {t.basis[zone.basis]}
                </span>
              </div>
              <ul className="src-list">
                {zoneSources.map((s) => (
                  <li key={s.title}>
                    <span>{s.title}</span>
                    <span className="src-url">{s.url}</span>
                  </li>
                ))}
              </ul>
              <div className="src-date">
                {t.checked}: {CHECKED}
              </div>
            </div>
          </section>

          <section className="panel tasks">
            <div className="tasks-head">
              <div className="eyebrow">{t.countermeasures}</div>
              <span className="count">
                {doneCount}/{report.tasks.length}
              </span>
            </div>
            <div className="progress">
              <i style={{ width: `${(doneCount / report.tasks.length) * 100}%` }} />
            </div>
            <ul>
              {report.tasks.map((task) => {
                const locTask = t.tasks[task.id as keyof typeof t.tasks];
                return (
                  <li key={task.id}>
                    <button
                      className="task"
                      data-done={task.done}
                      onClick={() => {
                        if (task.id === "sleep_log" || task.id === "bp_check") {
                          setTabletPath({
                            section: "checkIn",
                            module: task.id === "sleep_log" ? "sleepMood" : "bloodPressure",
                          });
                          setTabletOpen(true);
                        } else {
                          run("toggle_task", { id: task.id });
                        }
                      }}
                    >
                      <span className="check" />
                      <span className="task-body">
                        <span className="task-title">{locTask?.title ?? task.title}</span>
                        <span className="task-detail">{locTask?.detail ?? task.detail}</span>
                      </span>
                      <span className="task-meta">
                        {task.category}
                        <br />
                        {task.minutes} min
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>

        {tabletOpen && (
          <Tablet
            lang={lang}
            report={report}
            body={body}
            path={tabletPath}
            onNavigate={setTabletPath}
            onClose={() => setTabletOpen(false)}
          />
        )}
      </main>

      {error && <div className="toast">{error}</div>}
    </div>
  );
}