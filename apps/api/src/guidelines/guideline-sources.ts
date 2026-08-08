import { activeGuidelineSources } from "@glymize/clinical-engine";

/**
 * API/admin monitoring and the clinical engine share one evidence registry so
 * a source cannot be advertised in the UI while being disconnected from the
 * decision logic.
 */
export const guidelineSources = activeGuidelineSources;
