import * as React from "react"
import { ArrowLeft, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Loader2, Lock, Maximize, AlertCircle, RefreshCw, ListVideo } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ui/card"
import { useApp } from "@/context/AppContext"
import { fetchEpisodes } from "@/lib/api"
import type { Episode, EpisodesResponse } from "@/types/drama"

const PROXY_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dramabox`

export function WatchPage() {
  const { viewParams, navigateTo } = useApp()
  const movieId = viewParams.movieId
  const movieTitle = viewParams.title || "Phim"

  const [episodes, setEpisodes] = React.useState<Episode[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [currentIdx, setCurrentIdx] = React.useState(0)
  const [isPlaying, setIsPlaying] = React.useState(false)
  const [muted, setMuted] = React.useState(false)
  const [showControls, setShowControls] = React.useState(true)
  const [currentTime, setCurrentTime] = React.useState(0)
  const [duration, setDuration] = React.useState(0)
  const [buffering, setBuffering] = React.useState(false)

  const [proxyMode, setProxyMode] = React.useState<"signed" | "proxy">("signed")
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const controlsTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load episodes
  React.useEffect(() => {
    if (!movieId) return
    setLoading(true)
    setError(null)
    fetchEpisodes(movieId)
      .then((data: EpisodesResponse) => {
        if (!data.ok) throw new Error(data.error || "Lỗi tải tập phim")
        setEpisodes(data.episodes)
        setCurrentIdx(0)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [movieId])

  // Auto-play first episode
  React.useEffect(() => {
    if (episodes.length > 0 && !loading) {
      loadEpisode(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodes, loading])

  // Reload current episode when proxy mode changes (after initial load)
  React.useEffect(() => {
    if (episodes.length > 0 && !loading) {
      loadEpisode(currentIdx)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proxyMode])

  function buildStreamUrl(ep: Episode): string | null {
    const playable = ep._playable
    if (playable) {
      if (proxyMode === "proxy") {
        return `${PROXY_BASE}/proxy?url=${encodeURIComponent(playable.url)}`
      }
      return playable.url
    }
    // fallback: try first cdn
    const cdn = ep.cdnList?.[0]
    const v = cdn?.videoPathList?.[0]
    if (v) {
      return `${PROXY_BASE}/proxy?url=${encodeURIComponent(v.videoPath)}`
    }
    return null
  }

  async function loadEpisode(idx: number) {
    if (idx < 0 || idx >= episodes.length) return
    setCurrentIdx(idx)
    const ep = episodes[idx]
    const url = buildStreamUrl(ep)
    if (!url) return
    const video = videoRef.current
    if (!video) return
    setBuffering(true)
    video.src = url
    try {
      await video.play()
      setIsPlaying(true)
    } catch {
      // autoplay blocked
      setIsPlaying(false)
    }
  }

  function togglePlay() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play()
      setIsPlaying(true)
    } else {
      video.pause()
      setIsPlaying(false)
    }
  }

  function toggleMute() {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setMuted(video.muted)
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const video = videoRef.current
    if (!video || !video.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    video.currentTime = pct * video.duration
  }

  function handleVideoError() {
    if (proxyMode === "signed") {
      setProxyMode("proxy")
    }
  }

  function showOverlayControls() {
    setShowControls(true)
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current)
    if (isPlaying) {
      controlsTimeout.current = setTimeout(() => setShowControls(false), 3000)
    }
  }

  function formatTime(s: number) {
    if (!isFinite(s)) return "00:00"
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
  }

  function goFullscreen() {
    const wrap = videoRef.current?.parentElement
    if (wrap?.requestFullscreen) wrap.requestFullscreen()
  }

  // Keyboard shortcuts
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      if (e.key === " ") { e.preventDefault(); togglePlay() }
      else if (e.key === "ArrowRight") { e.preventDefault(); loadEpisode(currentIdx + 1) }
      else if (e.key === "ArrowLeft") { e.preventDefault(); loadEpisode(currentIdx - 1) }
      else if (e.key.toLowerCase() === "m") toggleMute()
      else if (e.key.toLowerCase() === "f") goFullscreen()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, episodes])

  const currentEp = episodes[currentIdx]
  const progressPct = duration ? (currentTime / duration) * 100 : 0

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" className="mb-4 gap-1.5" onClick={() => navigateTo("home")}>
        <ArrowLeft className="size-4" /> Quay lại
      </Button>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT: Player + Info */}
        <div className="lg:col-span-8">
          {/* Player */}
          <div
            className="relative aspect-[9/16] max-h-[80vh] w-full overflow-hidden rounded-2xl bg-black"
            onMouseMove={showOverlayControls}
            onMouseLeave={() => isPlaying && setShowControls(false)}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("button")) return
              togglePlay()
              showOverlayControls()
            }}
          >
            <video
              ref={videoRef}
              className="h-full w-full object-contain"
              playsInline
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onWaiting={() => setBuffering(true)}
              onPlaying={() => setBuffering(false)}
              onError={handleVideoError}
              onEnded={() => loadEpisode(currentIdx + 1)}
            />

            {/* Loading state */}
            {loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
                <Loader2 className="size-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Đang tải tập phim...</p>
              </div>
            )}

            {/* Error state */}
            {error && !loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-center">
                <AlertCircle className="size-10 text-destructive" />
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button size="sm" variant="outline" onClick={() => navigateTo("home")}>
                  Về trang chủ
                </Button>
              </div>
            )}

            {/* Buffering spinner */}
            {buffering && !loading && !error && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Loader2 className="size-10 animate-spin text-white" />
              </div>
            )}

            {/* Overlay controls */}
            {!loading && !error && (
              <div
                className={`absolute inset-0 flex flex-col justify-between transition-opacity duration-300 ${
                  showControls ? "opacity-100" : "opacity-0 pointer-events-none"
                }`}
              >
                {/* Top bar */}
                <div className="bg-gradient-to-b from-black/80 to-transparent p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-white/60">Đang phát</p>
                      <h2 className="truncate text-sm font-bold text-white">{currentEp?.chapterName || movieTitle}</h2>
                    </div>
                    <Button size="icon-sm" variant="ghost" onClick={goFullscreen} className="text-white hover:bg-white/20">
                      <Maximize className="size-4" />
                    </Button>
                  </div>
                </div>

                {/* Center play button */}
                <div className="flex flex-1 items-center justify-center">
                  <button
                    className="flex size-16 items-center justify-center rounded-full bg-primary/80 text-white backdrop-blur-md transition-transform hover:scale-110"
                    onClick={(e) => { e.stopPropagation(); togglePlay() }}
                  >
                    {isPlaying ? <Pause className="size-7 fill-white text-white" /> : <Play className="ml-1 size-7 fill-white text-white" />}
                  </button>
                </div>

                {/* Bottom controls */}
                <div className="bg-gradient-to-t from-black/90 to-transparent p-4">
                  {/* Progress bar */}
                  <div className="group mb-3 cursor-pointer" onClick={(e) => { e.stopPropagation(); seek(e) }}>
                    <div className="relative h-1 overflow-hidden rounded-full bg-white/20 transition-all group-hover:h-1.5">
                      <div className="absolute h-full rounded-full bg-primary" style={{ width: `${progressPct}%` }} />
                    </div>
                  </div>
                  {/* Buttons row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <Button size="icon-sm" variant="ghost" onClick={(e) => { e.stopPropagation(); togglePlay() }} className="text-white hover:bg-white/20">
                        {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
                      </Button>
                      <Button size="icon-sm" variant="ghost" disabled={currentIdx === 0} onClick={(e) => { e.stopPropagation(); loadEpisode(currentIdx - 1) }} className="text-white hover:bg-white/20">
                        <SkipBack className="size-4" />
                      </Button>
                      <Button size="icon-sm" variant="ghost" disabled={currentIdx >= episodes.length - 1} onClick={(e) => { e.stopPropagation(); loadEpisode(currentIdx + 1) }} className="text-white hover:bg-white/20">
                        <SkipForward className="size-4" />
                      </Button>
                      <Button size="icon-sm" variant="ghost" onClick={(e) => { e.stopPropagation(); toggleMute() }} className="text-white hover:bg-white/20">
                        {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                      </Button>
                      <span className="px-2 font-mono text-xs text-white/80">
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Chapter info */}
          {!loading && !error && currentEp && (
            <Card className="mt-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="mb-1 text-base font-bold">{currentEp.chapterName}</h2>
                  <div className="flex items-center gap-2">
                    <Badge variant={currentEp.isCharge === 1 ? "default" : "secondary"} className={currentEp.isCharge === 1 ? "bg-amber-500 text-white" : ""}>
                      {currentEp.isCharge === 1 ? (
                        <><Lock className="mr-1 size-3" /> VIP</>
                      ) : "Free"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Tập {currentIdx + 1} / {episodes.length}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg border border-border p-0.5">
                    <button
                      onClick={() => setProxyMode("signed")}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        proxyMode === "signed" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Signed
                    </button>
                    <button
                      onClick={() => setProxyMode("proxy")}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        proxyMode === "proxy" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Proxy
                    </button>
                  </div>
                  <Button size="icon-sm" variant="outline" title="Tải lại" onClick={() => { setProxyMode("signed"); loadEpisode(currentIdx) }}>
                    <RefreshCw className="size-4" />
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* RIGHT: Episode list */}
        <div className="lg:col-span-4">
          <Card className="flex flex-col p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <ListVideo className="size-4 text-primary" /> Danh sách tập
              </h3>
              <span className="text-xs text-muted-foreground">{episodes.length} tập</span>
            </div>

            {loading ? (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-4">
                {Array.from({ length: 20 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="grid max-h-[60vh] grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-5 lg:grid-cols-4">
                {episodes.map((ep, i) => {
                  const isVip = ep.isCharge === 1
                  const isPlayable = !!ep._playable
                  const isCurrent = i === currentIdx
                  return (
                    <button
                      key={i}
                      disabled={!isPlayable}
                      onClick={() => loadEpisode(i)}
                      className={`relative flex aspect-square items-center justify-center rounded-lg border text-sm font-bold transition-all ${
                        isCurrent
                          ? "border-transparent bg-primary text-primary-foreground shadow-md"
                          : isPlayable
                            ? isVip
                              ? "border-amber-500/30 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-300"
                              : "border-border bg-muted/50 hover:bg-accent"
                            : "cursor-not-allowed border-border bg-muted/30 opacity-40"
                      }`}
                      title={ep.chapterName}
                    >
                      <span>{i + 1}</span>
                      {isVip && <Lock className="absolute right-1 top-1 size-2.5 text-amber-500" />}
                    </button>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
