import type { TabletSection } from "../../types";
import { WorkoutDayLog } from "./Workout";

export const workoutSection: TabletSection = {
  id: "workout",
  icon: "◎",
  modules: [{ id: "dayLog", icon: "◎", component: WorkoutDayLog }],
};
