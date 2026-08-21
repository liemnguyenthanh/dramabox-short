import * as React from "react"
import type { Language } from "@/types/drama"
import { getStoredLanguage, setStoredLanguage } from "@/lib/language"

type AppContextValue = {
  language: Language
  setLanguage: (lang: Language) => void
  currentMovie: string | null
  navigateTo: (view: AppView, params?: Record<string, string>) => void
  view: AppView
  viewParams: Record<string, string>
}

export type AppView = "home" | "watch" | "search"

const AppContext = React.createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = React.useState<Language>(getStoredLanguage)
  const [view, setView] = React.useState<AppView>("home")
  const [viewParams, setViewParams] = React.useState<Record<string, string>>({})
  const [currentMovie, setCurrentMovie] = React.useState<string | null>(null)

  const setLanguage = React.useCallback((lang: Language) => {
    setStoredLanguage(lang)
    setLanguageState(lang)
  }, [])

  const navigateTo = React.useCallback((nextView: AppView, params: Record<string, string> = {}) => {
    setView(nextView)
    setViewParams(params)
    if (params.movieId) setCurrentMovie(params.movieId)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [])

  return (
    <AppContext.Provider value={{ language, setLanguage, currentMovie, navigateTo, view, viewParams }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = React.useContext(AppContext)
  if (!ctx) throw new Error("useApp must be used within AppProvider")
  return ctx
}
