/**
 * i18n scaffolding (en + hi). The language setting exists and the dictionaries
 * are wired through `t()`; full externalization of every string is tracked in
 * STATUS.md as scaffolded — not every string is routed through it yet, and
 * this file says so plainly rather than pretending otherwise.
 */

export type Locale = 'en' | 'hi';

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

const hi: Partial<Record<keyof typeof en, string>> = {
  'library.title': 'लाइब्रेरी',
  'library.empty': 'अभी कोई रिकॉर्डिंग नहीं है',
  'record.title': 'नई रिकॉर्डिंग',
  'record.start': 'रिकॉर्डिंग शुरू करें',
  'record.stop': 'रोकें और एडिटर खोलें',
  'record.pause': 'रोकें',
  'export.title': 'एक्सपोर्ट',
  'editor.title': 'एडिटर',
  'settings.title': 'सेटिंग्स',
};

const dicts: Record<Locale, Partial<Record<string, string>>> = { en, hi };

export function t(locale: Locale, key: keyof typeof en): string {
  return dicts[locale]?.[key] ?? en[key] ?? key;
}

export function localeFor(language: string): Locale {
  return language === 'hi' ? 'hi' : 'en';
}
