import type { Lang } from "../../../i18n";
import { TABLET_I18N } from "../../tabletI18n";

interface Props {
  lang: Lang;
  day: number;
  onBack: () => void;
  onFill: () => void;
}

export function NoSignal({ lang, day, onBack, onFill }: Props) {
  const T = TABLET_I18N[lang].mindData;
  const code = `D${String(day).padStart(2, "0")}`;

  return (
    <div className="ns-root">
      <div className="ns-info">
        <span className="ns-day-label">{T.dayTitle(day)}</span>
        <span className="ns-no-data">{T.noData(day)}</span>
      </div>

      <div className="ns-monitor" aria-hidden="true">
        <div className="ns-screen">
          <div className="ns-scanlines" />
          <div className="ns-static" />
          <div className="ns-signal-block">
            <div className="ns-signal-text">{T.noSignalTitle}</div>
            <div className="ns-signal-sub">{T.noSignalSub(day)}</div>
          </div>
          <svg className="ns-corners" viewBox="0 0 320 200">
            <polyline points="12,30 12,12 30,12" fill="none" stroke="#43c0ae" strokeWidth="2" opacity="0.65" />
            <polyline points="290,12 308,12 308,30" fill="none" stroke="#43c0ae" strokeWidth="2" opacity="0.65" />
            <polyline points="12,170 12,188 30,188" fill="none" stroke="#43c0ae" strokeWidth="2" opacity="0.65" />
            <polyline points="290,188 308,188 308,170" fill="none" stroke="#43c0ae" strokeWidth="2" opacity="0.65" />
          </svg>
          <div className="ns-status-bar">
            <span>{T.noSignalStatus}</span>
            <span>◈</span>
            <span>{code}</span>
          </div>
        </div>
        <div className="ns-monitor-neck" />
        <div className="ns-monitor-base" />
      </div>

      <div className="dc-actions">
        <button type="button" className="md-btn md-btn-ghost" onClick={onBack}>
          {T.btnBack}
        </button>
        <button type="button" className="md-btn md-btn-primary" onClick={onFill}>
          {T.btnFill}
        </button>
      </div>
    </div>
  );
}