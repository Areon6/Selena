import type { Lang } from "../../../i18n";
import type { DayEntry, LogMap } from "../../../types";
import { TABLET_I18N } from "../../tabletI18n";

interface Props {
  lang: Lang;
  logMap: LogMap;
  currentDay: number;
  range: 0 | 1 | 2;
  onRangeChange: (r: 0 | 1 | 2) => void;
  onSelectDay: (day: number) => void;
  onResetLog: () => void;
  resetting: boolean;
}

const RANGES: Array<[number, number]> = [
  [1, 28],
  [29, 56],
  [57, 78],
];

function entryClass(entry: DayEntry | undefined, isToday: boolean): string {
  const base = entry?.level ? `cal-cell cal-cell-${entry.level}` : "cal-cell cal-cell-empty";
  return isToday ? `${base} cal-cell-today` : base;
}

export function CalendarView({
  lang,
  logMap,
  currentDay,
  range,
  onRangeChange,
  onSelectDay,
  onResetLog,
  resetting,
}: Props) {
  const T = TABLET_I18N[lang].mindData;
  const [start, rawEnd] = RANGES[range];
  const end = range === 2 ? Math.max(rawEnd, currentDay) : rawEnd;

  const days: number[] = [];
  for (let d = start; d <= end; d++) days.push(d);

  return (
    <div className="cal-root">
      <div className="cal-range-row">
        {([0, 1, 2] as const).map((idx) => (
          <button
            key={idx}
            type="button"
            className={range === idx ? "cal-range-btn active" : "cal-range-btn"}
            onClick={() => onRangeChange(idx)}
          >
            {T.ranges[idx]}
          </button>
        ))}
        <button
          type="button"
          className="cal-range-btn cal-range-today"
          onClick={() => {
            onRangeChange(2);
            onSelectDay(currentDay);
          }}
        >
          → D{currentDay}
        </button>
      </div>

      <div className="cal-grid">
        {days.map((day) => {
          const entry = logMap.get(day);
          const isToday = day === currentDay;
          return (
            <button
              key={day}
              type="button"
              className={entryClass(entry, isToday)}
              onClick={() => onSelectDay(day)}
            >
              <span className="cal-cell-num">{T.dayShort(day)}</span>
              <span className="cal-cell-rank">{entry?.rank ?? "—"}</span>
              {isToday && <span className="cal-cell-now-dot" />}
            </button>
          );
        })}
      </div>

      <div className="cal-legend">
        <span className="cal-leg-item">
          <i className="cal-dot cal-dot-nominal" />
          {T.levels.nominal}
        </span>
        <span className="cal-leg-item">
          <i className="cal-dot cal-dot-watch" />
          {T.levels.watch}
        </span>
        <span className="cal-leg-item">
          <i className="cal-dot cal-dot-critical" />
          {T.levels.critical}
        </span>
        <span className="cal-leg-item">
          <i className="cal-dot cal-dot-empty" />
          {T.emptyLevel}
        </span>
      </div>

      <div className="cal-foot-row">
        <p className="cal-disclaimer">{T.calDisclaimer}</p>
        <button
          type="button"
          className="cal-reset-btn"
          onClick={onResetLog}
          disabled={resetting}
        >
          {resetting ? T.resetting : T.resetSample}
        </button>
      </div>
    </div>
  );
}