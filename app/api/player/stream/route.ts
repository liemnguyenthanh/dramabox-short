import { NextResponse } from "next/server"
import { isAllowedVideoUrl, proxyVideo } from "@/lib/player-server"

export async function GET(request: Request) {
  const targetUrl = new URL(request.url).searchParams.get("url") || ""
  if (!isAllowedVideoUrl(targetUrl)) return NextResponse.json({ error: "URL video không hợp lệ" }, { status: 400 })
  try {
    const upstream = await proxyVideo(targetUrl, request.headers.get("range"))
    const headers = new Headers()
    headers.set("Content-Type", upstream.headers.get("content-type") || "video/mp4")
    for (const name of ["content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
      const value = upstream.headers.get(name)
      if (value) headers.set(name, value)
    }
    return new Response(upstream.body, { status: upstream.status, headers })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không proxy được video" }, { status: 502 })
  }
}
