import type { TabletSection } from "../../types";
import { MindDataAnalytics, MindDataCalendar, MindDataImport } from "./MindData";

export const mindDataSection: TabletSection = {
  id: "mindData",
  icon: "◈",
  modules: [
    { id: "calendar", icon: "▦", component: MindDataCalendar },
    { id: "analytics", icon: "◈", component: MindDataAnalytics },
    { id: "importReport", icon: "⇥", component: MindDataImport },
  ],
};