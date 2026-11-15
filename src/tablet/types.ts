import type { ComponentType } from "react";
import type { HealthReport } from "../types";
import type { Lang } from "../i18n";
import type { BodyProfileApi } from "../hooks/useBodyProfile";

/** Everything a module may need. Add new shared services here (e.g. `labs`, `cognitive`). */
export interface ModuleProps {
  lang: Lang;
  report: HealthReport;
  body: BodyProfileApi;
}

/** A module is a leaf screen inside a section. Its texts live in TABLET_I18N[lang].sections[section.id].modules[id]. */
export interface TabletModule {
  id: string;
  icon: string;
  component: ComponentType<ModuleProps>;
}

/** Section keys. "workout" is the Stage 6 Workout & Fuel section. */
export type TabletSectionId = "myBody" | "checkIn" | "mindData" | "workout";

/** A section groups modules. Its texts live in TABLET_I18N[lang].sections[id]. */
export interface TabletSection {
  id: TabletSectionId;
  icon: string;
  modules: TabletModule[];
}

/** Navigation state; owned by App so the tablet reopens where it was closed. */
export interface TabletPath {
  section: TabletSectionId | null;
  module: string | null;
}

export const TABLET_HOME: TabletPath = { section: null, module: null };
