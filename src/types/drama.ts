export interface DramaCard {
  id: string
  title: string
  cover: string
  episodeIndex: number
  duration: number
  chapterId: string
  collectCount: number
  readCount: number
  playCount: string
  paidStart: number
  aspectRatio: number
  specialDesc: string
  chapterCount: number
  theme: string[]
  badges: string[]
}

export interface HomeTab {
  id: string
  title: string
  active: boolean
  channelType: number
  channelTypeName: string
  endpoint: string
}

export interface HomeShelf {
  id: string
  title: string
  scene: string
  cards: DramaCard[]
}

export interface HomeData {
  tabs: HomeTab[]
  shelves: HomeShelf[]
}

export interface SearchResult {
  id: string
  title: string
  cover: string
  playCount: string
  specialDesc: string
  chapterCount: number
  theme: string[]
  badges: string[]
}

// Episode/player types (from sansekai API)
export interface VideoPath {
  quality: string
  videoPath: string
  isVipEquity: number
  isDefault: boolean
}

export interface CdnItem {
  cdnDomain: string
  videoPathList: VideoPath[]
}

export interface Episode {
  chapterIndex: number
  chapterName: string
  isCharge: number
  cdnList: CdnItem[]
  _playable?: {
    url: string
    cdn: string
    quality: string
    isVip: boolean
    size: number
  } | null
}

export interface EpisodesResponse {
  ok: boolean
  bookId: string
  count: number
  playableCount: number
  episodes: Episode[]
  error?: string
}

export type Language = "en" | "zhHans" | "zh" | "ja" | "ko" | "es" | "pt" | "fr" | "in" | "de" | "vi" | "it" | "tr" | "th" | "ar"
