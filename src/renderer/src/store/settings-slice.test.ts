// ---------------------------------------------------------------------------
// Settings-slice palette/skin defaults + custom-palette CRUD tests.
//
// Locks the long-form defaults (skin / palette id / empty custom list) and the
// add/update/remove setters — including the rule that removing the currently
// selected custom palette resets the selection back to the brand default.
// ---------------------------------------------------------------------------

import { clearRegisteredCredentialValues } from '@shared/credential-safety';
import { DEFAULT_AUTOSAVE_INTERVAL_MS } from '@shared/project';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installApiStub } from '@/components/__tests__/test-utils';

import {
  DEFAULT_SETTINGS,
  FILLER_PRESET_LET_IT_RIDE,
  loadPersistedSettings,
  migrateFillerRemoval,
} from './helpers';
import { useStore } from './index';
import type { Palette } from './types';

installApiStub();

function customPalette(over: Partial<Palette> = {}): Palette {
  return {
    id: 'custom-1',
    name: 'Custom One',
    background: '#101010',
    foreground: '#fafafa',
    accent: '#00ffaa',
    builtin: false,
    ...over,
  };
}

function resetStore(): void {
  clearRegisteredCredentialValues();
  useStore.getState().resetSettings();
  useStore.setState((state) => ({
    errorLog: [],
    settings: {
      ...state.settings,
      geminiApiKey: '',
      pexelsApiKey: '',
      falApiKey: '',
    },
  }));
}

describe('settings defaults — long-form skin & palette', () => {
  it('ship the expected long-form defaults', () => {
    expect(DEFAULT_SETTINGS.longformSkin).toBe('editorial');
    expect(DEFAULT_SETTINGS.longformPaletteId).toBe('brand');
    expect(DEFAULT_SETTINGS.customPalettes).toEqual([]);
  });
});

describe('short-form filler defaults', () => {
  it('keeps a natural 600 ms pause before render-side breath padding', () => {
    expect(FILLER_PRESET_LET_IT_RIDE.silenceTargetGap).toBe(0.6);
  });

  it('upgrades saved named presets to current canonical tuning', () => {
    expect(
      migrateFillerRemoval({
        preset: 'let-it-ride',
        enabled: false,
        silenceTargetGap: 0.4,
      }),
    ).toEqual({ ...FILLER_PRESET_LET_IT_RIDE, enabled: false });
  });
});

describe('autosave settings', () => {
  beforeEach(() => {
    resetStore();
  });

  it('ships the shared autosave interval default', () => {
    expect(DEFAULT_SETTINGS.autosaveIntervalMs).toBe(DEFAULT_AUTOSAVE_INTERVAL_MS);
  });

  it('hydrates the configured autosave interval from safeStorage', async () => {
    const getSecret = vi
      .spyOn(window.api.secrets, 'get')
      .mockImplementation(async (name) => (name === 'autosaveIntervalMs' ? '30000' : null));

    try {
      await useStore.getState().hydrateSecretsFromMain();
      expect(useStore.getState().settings.autosaveIntervalMs).toBe(30_000);
    } finally {
      getSecret.mockRestore();
    }
  });
});

describe('promo-mode settings', () => {
  beforeEach(() => {
    resetStore();
  });

  it('ship the expected promo defaults', () => {
    expect(DEFAULT_SETTINGS.promo.enabled).toBe(false);
    expect(DEFAULT_SETTINGS.promo.forceCta).toBe(true);
    expect(DEFAULT_SETTINGS.promo.accentColor).toBe('#9f75ff');
  });

  it('setPromoEnabled / setPromoForceCta / setPromoAccentColor mutate their fields', () => {
    useStore.getState().setPromoEnabled(true);
    useStore.getState().setPromoForceCta(false);
    useStore.getState().setPromoAccentColor('#123456');
    const promo = useStore.getState().settings.promo;
    expect(promo.enabled).toBe(true);
    expect(promo.forceCta).toBe(false);
    expect(promo.accentColor).toBe('#123456');
  });

  it("resetSection('promo') restores the promo defaults", () => {
    useStore.getState().setPromoEnabled(true);
    useStore.getState().setPromoAccentColor('#000000');
    useStore.getState().resetSection('promo');
    expect(useStore.getState().settings.promo).toEqual(DEFAULT_SETTINGS.promo);
  });
});

describe('credential safety', () => {
  beforeEach(() => {
    resetStore();
  });

  it('never hydrates a legacy fal.ai key from plaintext settings state', () => {
    localStorage.setItem('batchclip-fal-key', 'legacy-plaintext-fal-key');
    try {
      expect(loadPersistedSettings().falApiKey).toBe('');
    } finally {
      localStorage.removeItem('batchclip-fal-key');
    }
  });

  it('registers in-memory credential setters for error-log redaction', () => {
    const geminiKey = 'gemini-settings-regression-key';
    const falKey = 'fal-settings:regression-secret';
    useStore.getState().setGeminiApiKey(geminiKey);
    useStore.getState().setFalApiKey(falKey);

    useStore.getState().addError({
      source: 'settings',
      message: `Provider failure: ${geminiKey}`,
      details: `Authorization: Bearer ${falKey}`,
    });

    const entry = useStore.getState().errorLog[0];
    if (!entry) throw new Error('Expected a redacted error-log entry');
    expect(entry.technicalDetails).not.toContain(geminiKey);
    expect(entry.technicalDetails).not.toContain(falKey);
    expect(entry.technicalDetails).toContain('[REDACTED]');
  });
});

describe('custom-palette CRUD setters', () => {
  beforeEach(() => {
    resetStore();
  });

  it('addCustomPalette appends a palette', () => {
    const p = customPalette();
    useStore.getState().addCustomPalette(p);
    expect(useStore.getState().settings.customPalettes).toEqual([p]);
  });

  it('addCustomPalette replaces an existing palette with the same id', () => {
    useStore.getState().addCustomPalette(customPalette());
    useStore.getState().addCustomPalette(customPalette({ name: 'Renamed' }));
    const list = useStore.getState().settings.customPalettes;
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Renamed');
  });

  it('updateCustomPalette patches fields but preserves the id', () => {
    useStore.getState().addCustomPalette(customPalette());
    useStore.getState().updateCustomPalette('custom-1', { accent: '#ff0000', id: 'hacked' });
    const list = useStore.getState().settings.customPalettes;
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('custom-1');
    expect(list[0].accent).toBe('#ff0000');
  });

  it('removeCustomPalette drops the palette', () => {
    useStore.getState().addCustomPalette(customPalette());
    useStore.getState().removeCustomPalette('custom-1');
    expect(useStore.getState().settings.customPalettes).toEqual([]);
  });

  it('removing the selected custom palette resets longformPaletteId to brand', () => {
    useStore.getState().addCustomPalette(customPalette());
    useStore.getState().setLongformPaletteId('custom-1');
    expect(useStore.getState().settings.longformPaletteId).toBe('custom-1');

    useStore.getState().removeCustomPalette('custom-1');
    expect(useStore.getState().settings.longformPaletteId).toBe('brand');
  });

  it('removing a non-selected custom palette leaves the selection intact', () => {
    useStore.getState().addCustomPalette(customPalette());
    useStore.getState().addCustomPalette(customPalette({ id: 'custom-2', name: 'Two' }));
    useStore.getState().setLongformPaletteId('custom-2');

    useStore.getState().removeCustomPalette('custom-1');
    expect(useStore.getState().settings.longformPaletteId).toBe('custom-2');
  });
});
