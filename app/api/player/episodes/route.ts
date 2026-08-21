import { NextResponse } from "next/server"
import { getEpisodes } from "@/lib/player-server"

export async function GET(request: Request) {
  const bookId = new URL(request.url).searchParams.get("bookId") || ""
  if (!/^\d{10,20}$/.test(bookId)) return NextResponse.json({ ok: false, error: "bookId không hợp lệ" }, { status: 400 })
  try {
    const episodes = await getEpisodes(bookId)
    return NextResponse.json({ ok: true, bookId, count: episodes.length, playableCount: episodes.filter((episode: any) => episode._playable).length, episodes })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Không tải được tập phim" }, { status: 502 })
  }
}
