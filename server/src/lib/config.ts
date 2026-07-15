import { getSetting, setSetting } from '../db/repository.js';
import type { Settings } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/types';

/** Get all settings merged with defaults. */
export function getSettings(): Settings {
  const raw = getSetting('all_settings_json');
  if (raw) {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) as Partial<Settings> };
    } catch {
      // Fall through to defaults
    }
  }
  return { ...DEFAULT_SETTINGS };
}

/** Update settings (merge). */
export function updateSettings(partial: Partial<Settings>): Settings {
  const current = getSettings();
  const updated = { ...current, ...partial };
  // Deep merge score_weights
  if (partial.score_weights) {
    updated.score_weights = { ...current.score_weights, ...partial.score_weights };
  }
  setSetting('all_settings_json', JSON.stringify(updated));
  return updated;
}

/** Get a specific setting value. */
export function getConfigValue(key: keyof Settings): string {
  return getSetting(key);
}

/** Set a specific setting value. */
export function setConfigValue(key: string, value: string): void {
  setSetting(key, value);
}
