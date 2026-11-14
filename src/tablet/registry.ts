import type { TabletSection } from "./types";
import { myBodySection } from "./sections/myBody";
import { checkInSection } from "./sections/checkIn";
import { mindDataSection } from "./sections/mindData";

export const TABLET_SECTIONS: TabletSection[] = [
  myBodySection,
  checkInSection,
  mindDataSection,
];