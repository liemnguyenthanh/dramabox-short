import * as React from "react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { ChevronDown } from "lucide-react"
import { MovieCard } from "@/components/MovieCard"
import { fetchHome, fetchRecommendations } from "@/lib/api"
import { useApp } from "@/context/AppContext"
import type { DramaCard, HomeTab } from "@/types/drama"

export function HomePage() {
  const { language } = useApp()
  const [tabs, setTabs] = React.useState<HomeTab[]>([])
  const [activeTab, setActiveTab] = React.useState<HomeTab | null>(null)
  const [movies, setMovies] = React.useState<DramaCard[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [page, setPage] = React.useState(1)
  const [hasMore, setHasMore] = React.useState(true)

  // Load home tabs
  React.useEffect(() => {
    setLoading(true)
    fetchHome(language, 1, 20)
      .then((data) => {
        setTabs(data.tabs)
        const hotTab = data.tabs.find((t: HomeTab) => t.channelType === 1) ?? data.tabs[0]
        setActiveTab(hotTab)
        const allCards: DramaCard[] = data.shelves?.flatMap((s: { cards: DramaCard[] }) => s.cards) ?? []
        setMovies(allCards)
        setPage(1)
        setHasMore(allCards.length >= 20)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [language])

  // Load more via recommendations API when tab changes
  const loadMoviesForTab = React.useCallback(async (tab: HomeTab, pageNo: number, append: boolean) => {
    if (pageNo === 1) setLoading(true)
    else setLoadingMore(true)

    try {
      if (tab.channelType === 1 && pageNo === 1) {
        // Already loaded from home API
        return
      }
      const data = await fetchRecommendations(tab.id, pageNo, language)
      const cards: DramaCard[] = data.cards ?? []
      if (append) {
        setMovies((prev) => [...prev, ...cards])
      } else {
        setMovies(cards)
      }
      setHasMore(cards.length >= 20)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [language])

  function handleTabChange(tabId: string) {
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab) return
    setActiveTab(tab)
    setPage(1)
    loadMoviesForTab(tab, 1, false)
  }

  function handleLoadMore() {
    if (!activeTab) return
    const nextPage = page + 1
    setPage(nextPage)
    loadMoviesForTab(activeTab, nextPage, true)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Tabs */}
      {tabs.length > 0 && (
        <Tabs
          value={activeTab?.id ?? tabs[0]?.id}
          onValueChange={handleTabChange}
          className="mb-6"
        >
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.title}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {/* Grid */}
      {loading ? (
        <LoadingGrid />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {movies.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>

          {hasMore && (
            <div className="mt-8 flex justify-center">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="gap-2"
              >
                {loadingMore ? "Đang tải..." : (
                  <>
                    Xem thêm <ChevronDown className="size-4" />
                  </>
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: 18 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl">
          <Skeleton className="aspect-[9/16] w-full" />
          <div className="space-y-1.5 p-2.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}
