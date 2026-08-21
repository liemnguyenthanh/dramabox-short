import type { Language } from "@/types/drama"

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  zhHans: "中文(简)",
  zh: "中文(繁)",
  ja: "日本語",
  ko: "한국어",
  es: "Español",
  pt: "Português",
  fr: "Français",
  in: "Indonesia",
  de: "Deutsch",
  vi: "Tiếng Việt",
  it: "Italiano",
  tr: "Türkçe",
  th: "ภาษาไทย",
  ar: "العربية",
}

export const LANGUAGES: Language[] = [
  "en", "zhHans", "zh", "ja", "ko", "es", "pt", "fr", "in", "de", "vi", "it", "tr", "th", "ar"
]

const STORAGE_KEY = "drama-language"

export function getStoredLanguage(): Language {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && LANGUAGES.includes(stored as Language)) return stored as Language
  return "vi"
}

export function setStoredLanguage(lang: Language) {
  localStorage.setItem(STORAGE_KEY, lang)
}
