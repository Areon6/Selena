import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { HealthReport, ImportResult, MindAnalytics, MissionLog } from "../../../types";
import type { Lang } from "../../../i18n";
import { TABLET_I18N } from "../../tabletI18n";

interface ImportViewProps {
  lang: Lang;
  report: HealthReport;
  log: MissionLog | null;
  onLogUpdated: (updated: MissionLog) => void;
}

const SAMPLE_DEVICE_CSV = `# SELENA Portable Biomedical & Environmental Export
# Units: ppCO2 in mmHg (NASA-STD-3001 V2 6004), dose_usv in uSv/h
day,hr,bp_sys,bp_dia,spo2,ppco2,sleep_h,dose_usv
73,66,119,75,97.6,2.4,7.5,39
74,84,134,85,96.3,3.4,6.2,42
76,78,129,82,96.8,2.9,6.8,225
77,64,117,74,97.8,2.3,7.9,40`;

type ReportFormat = "md" | "json";

function buildHoustonJson(
  report: HealthReport,
  log: MissionLog | null,
  analytics: MindAnalytics | null,
): string {
  const recentDays = log
    ? [...log.entries]
        .sort((a, b) => b.day - a.day)
        .slice(0, 5)
        .map((e) => ({
          day: e.day,
          source: e.source ?? "manual",
          level: e.level ?? "nominal",
          rankIllustrative: e.rank ?? null,
          ppco2Mmhg: e.ppco2 ?? null,
          sleepHours: e.sleepHours ?? null,
          doseUsvH: e.doseUsvH ?? null,
          hrBpm: e.hr ?? null,
          bpMmhg: e.bpSys != null && e.bpDia != null ? `${e.bpSys}/${e.bpDia}` : null,
          mood: e.mood ?? null,
          stress: e.stress ?? null,
        }))
    : [];

  const packet = {
    schema: "selena.houston.micro_report.v1",
    offlineAutonomous: report.autonomous,
    missionDay: report.missionDay,
    commsDelayOneWayMin: report.commsDelayMin,
    overallLevel: report.level,
    dataHonesty: {
      days1to77Notice: "Simulated sample history unless overwritten by crew/device import",
      ranksAndCorrelations: "illustrative (non-causal)",
      units: { ppCO2: "mmHg", doseRate: "uSv/h", cumulativeDose: "mSv", sleep: "hours" },
    },
    activeAlerts: report.alerts.map((a) => ({
      id: a.id,
      title: a.title,
      summary: a.summary,
    })),
    liveTelemetry: {
      vitals: {
        hrBpm: Number(report.vitals.heartRateBpm.toFixed(0)),
        bpMmhg: `${report.vitals.systolicMmhg.toFixed(0)}/${report.vitals.diastolicMmhg.toFixed(0)}`,
        spo2Pct: Number(report.vitals.spo2Pct.toFixed(1)),
        tempC: Number(report.vitals.bodyTempC.toFixed(1)),
        sleepHours: report.vitals.sleepHours,
        moodScore: report.vitals.moodScore,
      },
      environment: {
        ppco2Mmhg: Number(report.environment.co2Mmhg.toFixed(2)),
        doseRateUsvH: Number(report.environment.doseRateUsvH.toFixed(1)),
        cumulativeDoseMsv: Number(report.environment.cumulativeDoseMsv.toFixed(3)),
      },
    },
    hazards: report.hazards.map((h) => ({
      id: h.id,
      level: h.level,
      value: h.value,
      basis: h.basis,
    })),
    archiveCoverage: analytics
      ? {
          loggedDays: analytics.coverage.loggedDays,
          totalDays: analytics.coverage.totalDays,
          bySource: {
            simulatedSample: analytics.coverage.sampleDays,
            manual: analytics.coverage.manualDays,
            checkin: analytics.coverage.checkinDays,
            deviceImport: analytics.coverage.importDays,
          },
          avgMood: analytics.coverage.avgMood,
          avgStress: analytics.coverage.avgStress,
          avgSleepHours: analytics.coverage.avgSleep,
          sharpShiftsCount: analytics.shifts.length,
        }
      : null,
    illustrativeAssociations: analytics
      ? analytics.correlations.map((c) => ({
          id: c.id,
          available: c.available,
          sampleSizes: `n = ${c.nA} vs ${c.nB} days`,
          basis: c.basis,
          metric1: c.metric1,
          metric2: c.metric2,
        }))
      : [],
    recentDays,
  };

  return JSON.stringify(packet, null, 2);
}

function buildHoustonMarkdown(
  report: HealthReport,
  log: MissionLog | null,
  analytics: MindAnalytics | null,
): string {
  const lines: string[] = [
    `# SELENA MICRO-REPORT — DAY ${report.missionDay}`,
    `- Comms Queue: ${report.commsDelayMin} min one-way · Autonomous CDSS: ${report.autonomous ? "ON" : "OFF"}`,
    `- Overall Status: **${report.level.toUpperCase()}**`,
    "",
    "## Live Telemetry (Onboard)",
    `- HR: ${report.vitals.heartRateBpm.toFixed(0)} bpm · BP: ${report.vitals.systolicMmhg.toFixed(0)}/${report.vitals.diastolicMmhg.toFixed(0)} mmHg · SpO₂: ${report.vitals.spo2Pct.toFixed(1)}% · Temp: ${report.vitals.bodyTempC.toFixed(1)} °C`,
    `- Cabin ppCO₂: ${report.environment.co2Mmhg.toFixed(2)} mmHg (Limit 3.0 mmHg NASA-STD-3001 V2 6004; >4.5 mmHg OCHMO-TB-004)`,
    `- Radiation: ${report.environment.doseRateUsvH.toFixed(0)} µSv/h · Cumulative: ${report.environment.cumulativeDoseMsv.toFixed(3)} mSv (Career <600 mSv)`,
    `- Check-in Sleep / Mood: ${report.vitals.sleepHours !== null ? `${report.vitals.sleepHours.toFixed(1)} h` : "—"} · ${report.vitals.moodScore !== null ? `${report.vitals.moodScore}/5` : "—"}`,
  ];

  if (report.alerts.length > 0) {
    lines.push("", "## Active Alerts");
    for (const a of report.alerts) {
      lines.push(`- **${a.title}**: ${a.summary}`);
    }
  }

  if (analytics) {
    const c = analytics.coverage;
    lines.push(
      "",
      "## Mission Archive Summary (Days 1–77 include Simulated Sample History)",
      `- Logged: ${c.loggedDays}/${c.totalDays} days (${c.sampleDays} simulated, ${c.manualDays} manual, ${c.checkinDays} check-in, ${c.importDays} import)`,
      `- Averages: Mood ${c.avgMood ?? "—"}/5 · Stress ${c.avgStress ?? "—"}/5 · Sleep ${c.avgSleep ?? "—"} h · Sharp shifts: ${analytics.shifts.length}`,
    );

    const avail = analytics.correlations.filter((x) => x.available);
    if (avail.length > 0) {
      lines.push("", "## Mind ↔ Body Associations (Illustrative, non-causal)");
      for (const pair of avail) {
        const m1 = pair.metric1
          ? `${pair.metric1.key} Δ ${pair.metric1.delta > 0 ? "+" : ""}${pair.metric1.delta} ${pair.metric1.unit}`
          : "";
        lines.push(`- ${pair.id} (n = ${pair.nA} vs ${pair.nB} days, ${pair.basis}): ${m1}`);
      }
    }
  }

  if (log && log.entries.length > 0) {
    const recent = [...log.entries].sort((a, b) => b.day - a.day).slice(0, 5);
    lines.push("", "## Latest Logged Days");
    for (const e of recent) {
      const co2 = e.ppco2 != null ? `${e.ppco2.toFixed(1)} mmHg` : "—";
      const slp = e.sleepHours != null ? `${e.sleepHours.toFixed(1)} h` : "—";
      const dose = e.doseUsvH != null ? `${e.doseUsvH.toFixed(0)} µSv/h` : "—";
      lines.push(
        `- D${String(e.day).padStart(2, "0")} [${e.source ?? "manual"}] ${(e.level ?? "nominal").toUpperCase()} (${e.rank ?? "—"} illustrative) · ppCO₂ ${co2} · Sleep ${slp} · Dose ${dose}`,
      );
    }
  }

  return lines.join("\n");
}

export function ImportView({ lang, report, log, onLogUpdated }: ImportViewProps) {
  const T = TABLET_I18N[lang].mindData.importView;

  const [payload, setPayload] = useState("");
  const [importing, setImporting] = useState(false);
  const [importRes, setImportRes] = useState<ImportResult | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);

  const [analytics, setAnalytics] = useState<MindAnalytics | null>(null);
  const [reportFmt, setReportFmt] = useState<ReportFormat>("md");
  const [copied, setCopied] = useState(false);
  const [exportPath, setExportPath] = useState<string | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    invoke<MindAnalytics>("get_mind_analytics")
      .then((data) => {
        if (alive) setAnalytics(data);
      })
      .catch(() => {
        /* non-fatal for micro-report preview */
      });
    return () => {
      alive = false;
    };
  }, [log]);

  const mdText = useMemo(
    () => buildHoustonMarkdown(report, log, analytics),
    [report, log, analytics],
  );
  const jsonText = useMemo(
    () => buildHoustonJson(report, log, analytics),
    [report, log, analytics],
  );
  const activePreview = reportFmt === "md" ? mdText : jsonText;

  const handleFilePick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setPayload(reader.result);
        setImportErr(null);
        setImportRes(null);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleImport = async () => {
    setImporting(true);
    setImportErr(null);
    setImportRes(null);
    try {
      const res = await invoke<ImportResult>("import_device_log", { payload });
      setImportRes(res);
      onLogUpdated(res.log);
    } catch (e) {
      setImportErr(String(e));
    } finally {
      setImporting(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activePreview);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      setExportErr(String(e));
    }
  };

  const handleExport = async (fmt: ReportFormat) => {
    setExportErr(null);
    setExportPath(null);
    const filename = `selena-houston-day${report.missionDay}.${fmt}`;
    const content = fmt === "md" ? mdText : jsonText;
    try {
      const saved = await invoke<string>("export_houston_report", { filename, content });
      setExportPath(saved);
    } catch (e) {
      setExportErr(String(e));
    }
  };

  return (
    <div className="imp-root">
      {/* 1. Device Telemetry Importer */}
      <section className="imp-card">
        <div className="imp-head">
          <span className="imp-title">{T.importTitle}</span>
          <span className="imp-badge">{T.importBadge}</span>
        </div>

        <div className="imp-hint">{T.unitsHint}</div>

        <div className="imp-toolbar">
          <button
            type="button"
            className="md-btn md-btn-ghost imp-btn-sm"
            onClick={() => {
              setPayload(SAMPLE_DEVICE_CSV);
              setImportErr(null);
              setImportRes(null);
            }}
          >
            {T.btnLoadSample}
          </button>

          <label className="md-btn md-btn-ghost imp-btn-sm imp-file-label">
            {T.btnPickFile}
            <input
              type="file"
              accept=".csv,.json,.txt"
              className="imp-file-input"
              onChange={handleFilePick}
            />
          </label>
        </div>

        <textarea
          className="imp-textarea"
          rows={6}
          value={payload}
          placeholder={T.placeholder}
          onChange={(e) => setPayload(e.target.value)}
        />

        <div className="imp-actions">
          <button
            type="button"
            className="md-btn md-btn-primary"
            disabled={importing || payload.trim().length === 0}
            onClick={handleImport}
          >
            {importing ? T.btnImporting : T.btnImport}
          </button>
          <button
            type="button"
            className="md-btn md-btn-ghost"
            disabled={importing || (payload.length === 0 && !importRes && !importErr)}
            onClick={() => {
              setPayload("");
              setImportRes(null);
              setImportErr(null);
            }}
          >
            {T.btnClear}
          </button>
        </div>

        {importErr && <div className="tb-warn-box tb-err">{importErr}</div>}

        {importRes && (
          <div className="imp-result">
            <div className="imp-result-ok">
              {T.summary(
                importRes.format,
                importRes.importedDays,
                importRes.updatedDays,
                importRes.skippedRows,
              )}
            </div>
            {importRes.warnings.length > 0 && (
              <ul className="imp-warn-list">
                {importRes.warnings.slice(0, 5).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* 2. Houston Micro-Report Generator */}
      <section className="imp-card">
        <div className="imp-head">
          <span className="imp-title">{T.reportTitle}</span>
          <span className="imp-badge imp-badge-amber">
            {T.reportDelayBadge(report.commsDelayMin)}
          </span>
        </div>

        <div className="imp-seg">
          <button
            type="button"
            className={reportFmt === "md" ? "imp-seg-btn active" : "imp-seg-btn"}
            onClick={() => setReportFmt("md")}
          >
            {T.formatMd}
          </button>
          <button
            type="button"
            className={reportFmt === "json" ? "imp-seg-btn active" : "imp-seg-btn"}
            onClick={() => setReportFmt("json")}
          >
            {T.formatJson}
          </button>
        </div>

        <pre className="imp-preview">{activePreview}</pre>

        <div className="imp-export-row">
          <button type="button" className="md-btn md-btn-ghost imp-btn-sm" onClick={handleCopy}>
            {copied ? T.btnCopied : T.btnCopy}
          </button>
          <button
            type="button"
            className="md-btn md-btn-primary imp-btn-sm"
            onClick={() => handleExport("md")}
          >
            {T.btnExportMd}
          </button>
          <button
            type="button"
            className="md-btn md-btn-ghost imp-btn-sm"
            onClick={() => handleExport("json")}
          >
            {T.btnExportJson}
          </button>
        </div>

        {exportErr && <div className="tb-warn-box tb-err">{exportErr}</div>}
        {exportPath && <div className="imp-saved">{T.savedTo(exportPath)}</div>}

        <p className="imp-disclaimer">{T.reportDisclaimer}</p>
      </section>
    </div>
  );
}