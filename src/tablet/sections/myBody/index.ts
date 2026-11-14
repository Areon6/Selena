import type { TabletSection } from "../../types";
import { EnterParams } from "./EnterParams";
import { CheckState } from "./CheckState";

export const myBodySection: TabletSection = {
  id: "myBody",
  icon: "◍",
  modules: [
    { id: "enterParams", icon: "⌖", component: EnterParams },
    { id: "checkState", icon: "✚", component: CheckState },
  ],
};