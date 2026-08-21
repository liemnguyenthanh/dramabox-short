import * as React from "react"
import { Search as SearchIcon, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { MovieCard } from "@/components/MovieCard"
import { searchDramas } from "@/lib/api"
import { useApp } from "@/context/AppContext"
import type { DramaCard } from "@/types/drama"

export function SearchPage() {
  const { language, viewParams } = useApp()
  const [query, setQuery] = React.useState(viewParams.q ?? "")
  const [results, setResults] = React.useState<DramaCard[]>([])
  const [loading, setLoading] = React.useState(false)
  const [searched, setSearched] = React.useState(false)

  async function doSearch(q: string) {
    if (!q.trim()) return
    setLoading(true)
    setSearched(true)
    try {
      const data = await searchDramas(q.trim(), 1, 30, language)
      setResults(data.items ?? [])
    } catch (e) {
      console.error(e)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  // Search if initial query exists
  React.useEffect(() => {
    if (viewParams.q) {
      setQuery(viewParams.q)
      doSearch(viewParams.q)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewParams.q])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    doSearch(query)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Tìm kiếm phim</h1>

      <form onSubmit={handleSubmit} className="mb-8 flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nhập tên phim..."
            className="pl-9 pr-9"
            autoFocus
          />
          {query && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => { setQuery(""); setResults([]); setSearched(false) }}
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Button type="submit" disabled={loading || !query.trim()}>
          {loading ? "Đang tìm..." : "Tìm kiếm"}
        </Button>
      </form>

      {loading && <LoadingGrid />}

      {!loading && searched && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <SearchIcon className="mb-4 size-12 text-muted-foreground/40" />
          <p className="text-lg font-medium">Không tìm thấy kết quả</p>
          <p className="mt-1 text-sm text-muted-foreground">Thử từ khóa khác</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            Tìm thấy {results.length} kết quả cho "{query}"
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {results.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>
        </>
      )}

      {!searched && !loading && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <SearchIcon className="mb-4 size-12 text-muted-foreground/30" />
          <p className="text-muted-foreground">Tìm kiếm phim ngắn yêu thích của bạn</p>
        </div>
      )}
    </div>
  )
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: 12 }).map((_, i) => (
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
