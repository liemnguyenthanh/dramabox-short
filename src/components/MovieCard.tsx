import { Play, Eye } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { DramaCard } from "@/types/drama"
import { useApp } from "@/context/AppContext"

interface MovieCardProps {
  movie: DramaCard
  className?: string
}

export function MovieCard({ movie, className }: MovieCardProps) {
  const { navigateTo } = useApp()

  return (
    <div
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-xl bg-card transition-all duration-200 hover:scale-[1.03] hover:shadow-xl",
        className
      )}
      onClick={() => navigateTo("watch", { movieId: movie.id, title: movie.title })}
    >
      <div className="relative aspect-[9/16] w-full overflow-hidden bg-muted">
        <img
          src={movie.cover}
          alt={movie.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all duration-200 group-hover:bg-black/40">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 opacity-0 shadow-lg transition-all duration-200 group-hover:opacity-100">
            <Play className="ml-0.5 size-5 fill-black text-black" />
          </div>
        </div>
        {/* Episode count badge */}
        {movie.chapterCount > 0 && (
          <div className="absolute bottom-2 left-2">
            <Badge variant="secondary" className="bg-black/70 text-xs text-white backdrop-blur-sm">
              {movie.chapterCount} tập
            </Badge>
          </div>
        )}
        {/* Paid badge */}
        {movie.paidStart > 0 && (
          <div className="absolute top-2 right-2">
            <Badge className="bg-amber-500 text-xs text-white">VIP</Badge>
          </div>
        )}
      </div>

      <div className="p-2.5 pb-3">
        <h3 className="line-clamp-2 text-xs font-medium leading-snug text-foreground">
          {movie.title}
        </h3>
        {movie.playCount && (
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Eye className="size-3" />
            <span>{movie.playCount}</span>
          </div>
        )}
      </div>
    </div>
  )
}
