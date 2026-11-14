import type { TabletSection } from "./types";
import { myBodySection } from "./sections/myBody";

/**
 * To add a section (blood tests, cognitive tests, ...):
 *  1. create src/tablet/sections/<name>/index.ts exporting a TabletSection,
 *  2. add it to this array,
 *  3. add its texts to TABLET_I18N (both languages) under sections[<id>].
 */
export const TABLET_SECTIONS: TabletSection[] = [myBodySection];