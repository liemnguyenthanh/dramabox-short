import * as React from "react"
import { Search, Globe, Film } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ModeToggle } from "@/components/mode-toggle"
import { useApp } from "@/context/AppContext"
import { LANGUAGE_LABELS, LANGUAGES } from "@/lib/language"

export function Header() {
  const { language, setLanguage, navigateTo, view } = useApp()
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (searchOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [searchOpen])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (query.trim()) {
      navigateTo("search", { q: query.trim() })
      setSearchOpen(false)
      setQuery("")
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4">
        {/* Logo */}
        <button
          className="flex items-center gap-2 text-foreground"
          onClick={() => navigateTo("home")}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Film className="size-4 text-primary-foreground" />
          </div>
          <span className="hidden text-base font-bold sm:block">FShort</span>
        </button>

        {/* Center nav */}
        <nav className="hidden items-center gap-1 sm:flex">
          <Button
            variant={view === "home" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => navigateTo("home")}
          >
            Trang chủ
          </Button>
          <Button
            variant={view === "search" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => navigateTo("search", { q: "" })}
          >
            Tìm kiếm
          </Button>
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-1.5">
          {searchOpen ? (
            <form onSubmit={handleSearch} className="flex items-center gap-1.5">
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm phim..."
                className="h-8 w-44 text-sm sm:w-56"
                onKeyDown={(e) => e.key === "Escape" && setSearchOpen(false)}
              />
              <Button size="sm" type="submit">
                <Search className="size-3.5" />
              </Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => setSearchOpen(false)}>
                Hủy
              </Button>
            </form>
          ) : (
            <Button size="icon-sm" variant="ghost" aria-label="Search" onClick={() => setSearchOpen(true)}>
              <Search className="size-4" />
            </Button>
          )}

          {/* Language selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="gap-1.5">
                <Globe className="size-4" />
                <span className="hidden text-xs sm:block">{LANGUAGE_LABELS[language]}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
              {LANGUAGES.map((lang) => (
                <DropdownMenuItem
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={language === lang ? "bg-accent font-medium" : ""}
                >
                  {LANGUAGE_LABELS[lang]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <ModeToggle />
        </div>
      </div>
    </header>
  )
}
