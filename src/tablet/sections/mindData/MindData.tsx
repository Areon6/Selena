import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { DayEntry, MissionLog } from "../../../types";
import { buildLogMap } from "../../../types";
import type { ModuleProps } from "../../types";
import { TABLET_I18N } from "../../tabletI18n";
import { CalendarView } from "./CalendarView";
import { DayCard } from "./DayCard";
import { DayForm } from "./DayForm";
import { NoSignal } from "./NoSignal";

type SubTab = "calendar" | "analytics" | "import";
type Screen = "calendar" | "day-card" | "no-signal" | "day-form";

function MindDataView({ lang, initialTab }: ModuleProps & { initialTab: SubTab }) {
  const T = TABLET_I18N[lang].mindData;

  const [subTab, setSubTab] = useState<SubTab>(initialTab);
  const [log, setLog] = useState<MissionLog | null>(null);
  const [screen, setScreen] = useState<Screen>("calendar");
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [range, setRange] = useState<0 | 1 | 2>(2);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setSubTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    let alive = true;
    invoke<MissionLog>("get_mission_log")
      .then((data) => {
        if (!alive) return;
        setLog(data);
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

  const logMap = useMemo(() => (log ? buildLogMap(log) : new Map<number, DayEntry>()), [log]);
  const currentDay = log?.currentDay ?? 78;

  const handleSelectDay = (day: number) => {
    setSelectedDay(day);
    setScreen(logMap.has(day) ? "day-card" : "no-signal");
  };

  const handleSave = async (entry: DayEntry) => {
    const updated = await invoke<MissionLog>("save_day_entry", { entry });
    setLog(updated);
    setSelectedDay(entry.day);
    setScreen("day-card");
  };

  const handleResetLog = async () => {
    setResetting(true);
    setErr(null);
    try {
      const fresh = await invoke<MissionLog>("reset_mission_log");
      setLog(fresh);
      setScreen("calendar");
      setSelectedDay(null);
    } catch (e) {
      setErr(String(e));
    } finally {
      setResetting(false);
    }
  };

  const activeEntry = selectedDay !== null ? logMap.get(selectedDay) : undefined;

  return (
    <div className="md-root">
      <div className="md-seg">
        <button
          type="button"
          className={subTab === "calendar" ? "md-seg-btn active" : "md-seg-btn"}
          onClick={() => {
            setSubTab("calendar");
            setScreen("calendar");
          }}
        >
          {T.tabs.calendar}
        </button>
        <button
          type="button"
          className={subTab === "analytics" ? "md-seg-btn active" : "md-seg-btn"}
          onClick={() => setSubTab("analytics")}
        >
          {T.tabs.analytics}
        </button>
        <button
          type="button"
          className={subTab === "import" ? "md-seg-btn active" : "md-seg-btn"}
          onClick={() => setSubTab("import")}
        >
          {T.tabs.importReport}
        </button>
      </div>

      {err && <div className="tb-warn-box tb-err">{err}</div>}

      {loading ? (
        <div className="md-loading">{T.loading}</div>
      ) : subTab === "calendar" ? (
        <>
          {screen === "calendar" && (
            <CalendarView
              lang={lang}
              logMap={logMap}
              currentDay={currentDay}
              range={range}
              onRangeChange={setRange}
              onSelectDay={handleSelectDay}
              onResetLog={handleResetLog}
              resetting={resetting}
            />
          )}
          {screen === "day-card" && activeEntry && (
            <DayCard
              lang={lang}
              entry={activeEntry}
              onBack={() => {
                setScreen("calendar");
                setSelectedDay(null);
              }}
              onEdit={() => setScreen("day-form")}
            />
          )}
          {screen === "no-signal" && selectedDay !== null && (
            <NoSignal
              lang={lang}
              day={selectedDay}
              onBack={() => {
                setScreen("calendar");
                setSelectedDay(null);
              }}
              onFill={() => setScreen("day-form")}
            />
          )}
          {screen === "day-form" && selectedDay !== null && (
            <DayForm
              lang={lang}
              day={selectedDay}
              existing={activeEntry}
              onBack={() => setScreen(activeEntry ? "day-card" : "no-signal")}
              onSave={handleSave}
            />
          )}
        </>
      ) : subTab === "analytics" ? (
        <div className="md-stub">
          <div className="md-stub-icon">◈</div>
          <div className="md-stub-title">{T.tabs.analytics}</div>
          <div className="md-stub-sub">{T.stubAnalytics}</div>
          <div className="md-stub-badge">{T.nextStep}</div>
        </div>
      ) : (
        <div className="md-stub">
          <div className="md-stub-icon">⇥</div>
          <div className="md-stub-title">{T.tabs.importReport}</div>
          <div className="md-stub-sub">{T.stubImport}</div>
          <div className="md-stub-badge">{T.nextStep}</div>
        </div>
      )}
    </div>
  );
}

export function MindDataCalendar(props: ModuleProps) {
  return <MindDataView {...props} initialTab="calendar" />;
}

export function MindDataAnalytics(props: ModuleProps) {
  return <MindDataView {...props} initialTab="analytics" />;
}

export function MindDataImport(props: ModuleProps) {
  return <MindDataView {...props} initialTab="import" />;
}