import type { Lang } from "../i18n";
import type { HealthReport } from "../types";
import type { BodyProfileApi } from "../hooks/useBodyProfile";
import { TABLET_SECTIONS } from "./registry";
import { TABLET_HOME, type TabletPath } from "./types";
import { TABLET_I18N } from "./tabletI18n";
import "./tablet.css";

interface Props {
  lang: Lang;
  report: HealthReport;
  body: BodyProfileApi;
  path: TabletPath;
  onNavigate: (p: TabletPath) => void;
  onClose: () => void;
}

/** On-board tablet: Tablet → Sections → Modules. A side sheet over the right column; the 3D scanner stays visible. */
export function Tablet({ lang, report, body, path, onNavigate, onClose }: Props) {
  const T = TABLET_I18N[lang];
  const section = TABLET_SECTIONS.find((s) => s.id === path.section) ?? null;
  const module = section?.modules.find((m) => m.id === path.module) ?? null;

  const sectionTxt = section ? T.sections[section.id] : undefined;
  const moduleTxt = section && module ? sectionTxt?.modules[module.id] : undefined;

  const back = () =>
    onNavigate(module ? { section: section!.id, module: null } : TABLET_HOME);

  const crumbs: string[] = [];
  if (sectionTxt) crumbs.push(sectionTxt.title);
  if (moduleTxt) crumbs.push(moduleTxt.title);
  const heading = crumbs.length > 0 ? crumbs.join(" · ") : T.title;

  const Body = module?.component;

  return (
    <aside className="tablet" role="dialog" aria-label={T.title}>
      <header className="tb-head">
        <div className="tb-crumbs">
          {section && (
            <button className="tb-icon" onClick={back} aria-label={T.back} title={T.back}>
              ‹
            </button>
          )}
          <span className="tb-heading">{heading}</span>
        </div>
        <button className="tb-icon" onClick={onClose} aria-label={T.close} title={T.close}>
          ✕
        </button>
      </header>

      <div className="tb-body">
        {Body ? (
          <Body lang={lang} report={report} body={body} />
        ) : section ? (
          <ul className="tb-list">
            {section.modules.map((m) => (
              <li key={m.id}>
                <button onClick={() => onNavigate({ section: section.id, module: m.id })}>
                  <span className="tb-glyph">{m.icon}</span>
                  <span>
                    <b>{sectionTxt?.modules[m.id]?.title ?? m.id}</b>
                    <small>{sectionTxt?.modules[m.id]?.desc}</small>
                  </span>
                  <span className="tb-chev">›</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="tb-list">
            {TABLET_SECTIONS.map((s) => (
              <li key={s.id}>
                <button onClick={() => onNavigate({ section: s.id, module: null })}>
                  <span className="tb-glyph">{s.icon}</span>
                  <span>
                    <b>{T.sections[s.id]?.title ?? s.id}</b>
                    <small>{T.sections[s.id]?.desc}</small>
                  </span>
                  <span className="tb-chev">›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}