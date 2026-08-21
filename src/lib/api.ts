import type { Language } from "@/types/drama"

const BASE = "https://api.fshort.net/api/v1/dramabox"
const PLAYER_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dramabox`

export async function fetchHome(language: Language, pageNo = 1, pageSize = 20) {
  const res = await fetch(
    `${BASE}/home?language=${language}&pageNo=${pageNo}&pageSize=${pageSize}&homePageStyle=0`
  )
  if (!res.ok) throw new Error("Failed to fetch home")
  const json = await res.json()
  return json.data
}

export async function fetchRecommendations(specialColumnId: string, pageNo = 1, language: Language = "vi") {
  const res = await fetch(
    `${BASE}/recommendations?specialColumnId=${specialColumnId}&pageNo=${pageNo}&language=${language}`
  )
  if (!res.ok) throw new Error("Failed to fetch recommendations")
  const json = await res.json()
  return json.data
}

export async function searchDramas(q: string, pageNo = 1, pageSize = 30, language: Language = "vi") {
  const res = await fetch(
    `${BASE}/search?q=${encodeURIComponent(q)}&pageNo=${pageNo}&pageSize=${pageSize}&language=${language}`
  )
  if (!res.ok) throw new Error("Failed to search")
  const json = await res.json()
  return json.data
}

export async function fetchEpisodes(bookId: string): Promise<import("@/types/drama").EpisodesResponse> {
  const res = await fetch(`${PLAYER_BASE}/episodes?bookId=${bookId}`)
  if (!res.ok) throw new Error("Failed to fetch episodes")
  return res.json()
}
