"use client"

import { AppProvider, useApp } from "@/context/AppContext"
import { Header } from "@/components/Header"
import { HomePage } from "@/components/views/HomePage"
import { SearchPage } from "@/components/views/SearchPage"
import { WatchPage } from "@/components/views/WatchPage"

function AppContent() {
  const { view } = useApp()

  return (
    <div className="min-h-svh bg-background">
      <Header />
      <main>
        {view === "home" && <HomePage />}
        {view === "search" && <SearchPage />}
        {view === "watch" && <WatchPage />}
      </main>
    </div>
  )
}

export function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}

export default App
