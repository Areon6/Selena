import type { TabletSection } from "./types";
import { myBodySection } from "./sections/myBody";
import { checkInSection } from "./sections/checkIn";
import { mindDataSection } from "./sections/mindData";
import { workoutSection } from "./sections/workout";

export const TABLET_SECTIONS: TabletSection[] = [
  myBodySection,
  checkInSection,
  mindDataSection,
  workoutSection,
];
