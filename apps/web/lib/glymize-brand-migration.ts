const CURRENT_CATALOG_KEY = "glymize-browser-catalog-v2";
const LEGACY_CATALOG_KEYS = [
  "diayar-browser-catalog-v2",
  "diabeto-browser-catalog-v2",
] as const;

const CURRENT_LANGUAGE_KEY = "glymize-ui-language";
const LEGACY_LANGUAGE_KEYS = ["diayar-ui-language", "diabeto-ui-language"] as const;

/**
 * Preserves browser-only catalogue and language preferences after the
 * permanent GLYMIZE rebrand. The legacy keys are intentionally retained here
 * for one-way migration and should not be used for new writes.
 */
export function migrateLegacyGlymizeStorage(): void {
  if (typeof window === "undefined") {
    return;
  }

  migrateFirstAvailableValue(CURRENT_CATALOG_KEY, LEGACY_CATALOG_KEYS);
  migrateFirstAvailableValue(CURRENT_LANGUAGE_KEY, LEGACY_LANGUAGE_KEYS);
}

function migrateFirstAvailableValue(
  currentKey: string,
  legacyKeys: readonly string[],
): void {
  try {
    if (window.localStorage.getItem(currentKey) !== null) {
      return;
    }

    for (const legacyKey of legacyKeys) {
      const legacyValue = window.localStorage.getItem(legacyKey);
      if (legacyValue !== null) {
        window.localStorage.setItem(currentKey, legacyValue);
        return;
      }
    }
  } catch {
    // Storage may be unavailable in private or restricted browser contexts.
    // The application remains usable without local migration.
  }
}
