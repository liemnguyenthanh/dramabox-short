import { AppProvider, useApp } from "@/context/AppContext"
import { Header } from "@/components/Header"
import { HomePage } from "@/pages/HomePage"
import { SearchPage } from "@/pages/SearchPage"
import { WatchPage } from "@/pages/WatchPage"

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
