const API_BASE = "https://api.sansekai.my.id/api/dramabox"
const CDN_REFERER = "https://www.dramaboxdb.com/"
const CDN_ORIGIN = "https://www.dramaboxdb.com"

function randomIP() {
  return Array.from({ length: 4 }, () => Math.floor(Math.random() * 256)).join(".")
}

export function apiHeaders(): HeadersInit {
  const ip = randomIP()
  return { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36", "X-Forwarded-For": ip, "X-Real-IP": ip, Accept: "*/*" }
}

export function cdnHeaders(extra: HeadersInit = {}): HeadersInit {
  return { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36", Referer: CDN_REFERER, Origin: CDN_ORIGIN, ...extra }
}

export async function testVideoUrl(url: string) {
  try {
    const response = await fetch(url, { headers: cdnHeaders({ Range: "bytes=0-63" }), signal: AbortSignal.timeout(10000) })
    if (![200, 206].includes(response.status)) return null
    const contentType = response.headers.get("content-type") || ""
    if (!contentType.startsWith("video/") && !contentType.startsWith("application/octet-stream")) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length < 8 || bytes[4] !== 0x66 || bytes[5] !== 0x74 || bytes[6] !== 0x79 || bytes[7] !== 0x70) return null
    return Number(response.headers.get("content-length") || 0)
  } catch { return null }
}

export async function getEpisodes(bookId: string) {
  const response = await fetch(`${API_BASE}/allepisode?bookId=${bookId}`, { headers: apiHeaders(), signal: AbortSignal.timeout(20000), cache: "no-store" })
  if (!response.ok) throw new Error(`Nguồn phim trả HTTP ${response.status}`)
  const episodes = await response.json()
  if (!Array.isArray(episodes)) throw new Error("Nguồn phim trả dữ liệu không hợp lệ")
  const annotated = []
  for (const episode of episodes) {
    const candidates = (episode.cdnList || []).flatMap((cdn: any) => (cdn.videoPathList || []).map((video: any) => {
      const quality = Number.parseInt(video.quality, 10)
      const score = (quality === 720 ? 100 : quality === 540 ? 80 : quality === 360 ? 60 : quality === 1080 ? 40 : 20) + (!video.isVipEquity ? 50 : 0) + (video.isDefault ? 10 : 0)
      return { score, url: video.videoPath, cdn: cdn.cdnDomain, quality: video.quality, isVip: video.isVipEquity === 1 }
    })).sort((a: any, b: any) => b.score - a.score)
    let playable = null
    for (const candidate of candidates) {
      const size = await testVideoUrl(candidate.url)
      if (size !== null) { playable = { url: candidate.url, cdn: candidate.cdn, quality: candidate.quality, isVip: candidate.isVip, size }; break }
    }
    annotated.push({ ...episode, _playable: playable })
  }
  return annotated
}

export function isAllowedVideoUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:") return false
    const hostname = url.hostname.toLowerCase()
    return !["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(hostname) && !hostname.endsWith(".local")
  } catch { return false }
}

export async function proxyVideo(targetUrl: string, range: string | null) {
  return fetch(targetUrl, { headers: cdnHeaders(range ? { Range: range } : {}), signal: AbortSignal.timeout(60000) })
}

export async function decryptVideo(targetUrl: string) {
  const decryptUrl = `${API_BASE}/decrypt-stream?url=${encodeURIComponent(targetUrl)}`
  return fetch(decryptUrl, {
    headers: apiHeaders(),
    signal: AbortSignal.timeout(60000),
  })
}
