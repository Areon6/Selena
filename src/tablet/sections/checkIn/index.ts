import type { TabletSection } from "../../types";
import { SleepMood, BloodPressure } from "./CheckIn";

export const checkInSection: TabletSection = {
  id: "checkIn",
  icon: "☾",
  modules: [
    { id: "sleepMood", icon: "☾", component: SleepMood },
    { id: "bloodPressure", icon: "♡", component: BloodPressure },
  ],
};