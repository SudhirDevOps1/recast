/**
 * i18n scaffolding — English only.
 *
 * Recast ships with an all-English UI by product decision: every label,
 * heading, toast and dialog must read as clear English regardless of the
 * host OS locale. The dictionary shape is kept (a single `en` map routed
 * through `t()`) so future localization can re-enter without touching
 * call sites, but there is deliberately no second locale today.
 */

export type Locale = 'en';

const en = {
  'library.title': 'Library',
  'library.empty': 'No recordings yet',
  'record.title': 'New recording',
  'record.start': 'Start recording',
  'record.stop': 'Stop & open editor',
  'record.pause': 'Pause',
  'export.title': 'Export',
  'editor.title': 'Editor',
  'settings.title': 'Settings',
};

const dicts: Record<Locale, Partial<Record<string, string>>> = { en };

export function t(locale: Locale, key: keyof typeof en): string {
  return dicts[locale]?.[key] ?? en[key] ?? key;
}

export function localeFor(_language: string): Locale {
  return 'en';
}
