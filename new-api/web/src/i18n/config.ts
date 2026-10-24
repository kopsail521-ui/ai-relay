/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import i18n, { type BackendModule } from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import { toIntlLocale, convertDetectedLanguage } from './languages'
import en from './locales/en.json'

// Keep the readable fallback in the entry bundle. Download other dictionaries
// only when detected/selected, rather than sending all seven on every visit.
export const resources = { en } as const
const localeLoaders = {
  zhCN: () => import('./locales/zh.json'),
  fr: () => import('./locales/fr.json'),
  ru: () => import('./locales/ru.json'),
  ja: () => import('./locales/ja.json'),
  vi: () => import('./locales/vi.json'),
  zhTW: () => import('./locales/zh-TW.json'),
}

export const lazyLocaleBackend: BackendModule = {
  type: 'backend',
  init: () => undefined,
  async read(language, namespace) {
    if (namespace !== 'translation') {
      throw new Error('Unsupported interface translation namespace')
    }
    const load = localeLoaders[language as keyof typeof localeLoaders]
    if (!load) {
      throw new Error('Unsupported interface language')
    }
    const locale = await load()
    return locale.default.translation
  },
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .use(lazyLocaleBackend)
  .init({
    resources,
    partialBundledLanguages: true,
    fallbackLng: 'en',
    supportedLngs: ['en', 'zhCN', 'fr', 'ru', 'ja', 'vi', 'zhTW'],
    load: 'currentOnly',
    nsSeparator: false, // Allow literal colons in keys (e.g., URLs, labels)
    debug: import.meta.env.DEV,
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      // Browsers report `zh-CN`/`zh-TW`/`zh`; map them onto our `zhCN`/`zhTW`
      // codes (non-Chinese codes pass through for normal supportedLngs matching).
      convertDetectedLanguage,
    },
  })

// Keep <html lang> in sync with the interface language for a11y / SEO.
function syncDocumentLang(lng: string | undefined) {
  document.documentElement.lang =
    toIntlLocale(i18n.resolvedLanguage ?? lng ?? i18n.language) ?? 'en'
}

i18n.on('languageChanged', syncDocumentLang)
syncDocumentLang(i18n.language)

export default i18n
