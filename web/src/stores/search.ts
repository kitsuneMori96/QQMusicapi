import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import { isAbortError } from '@/api/http'
import {
  searchAlbum,
  searchSong,
  searchSonglist,
  type SearchItem,
  type SearchKind,
} from '@/api/search'
import type { AlbumSearchData, SongSearchData, SonglistSearchData } from '@/api/contracts'

const PAGE_SIZE = 20
const KINDS: SearchKind[] = ['song', 'album', 'songlist']

interface Bucket {
  items: SearchItem[]
  page: number
  total: number
  loading: boolean
  error: string
  /** 这一档在这个关键词下已经成功取过一次；切页签时据此决定要不要重发 */
  loaded: boolean
}

function emptyBucket(): Bucket {
  return { items: [], page: 1, total: 0, loading: false, error: '', loaded: false }
}

function errText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function fetcher(kind: SearchKind) {
  const table = {
    song: searchSong,
    album: searchAlbum,
    songlist: searchSonglist,
  } as const
  return table[kind] as (
    keyword: string,
    page: number,
    num: number,
    signal: AbortSignal,
  ) => Promise<SongSearchData | AlbumSearchData | SonglistSearchData>
}

/**
 * 关键词搜索：输入既不是 mid 也不是分享链接时才用它，结果点一条即交回解析流。
 * 歌曲 / 专辑 / 歌单三档各自缓存页码与结果，切页签不重复请求；
 * 同一档内新一轮请求 abort 上一轮，seq 令牌兜底丢弃过期响应。
 */
export const useSearchStore = defineStore('search', () => {
  const kind = ref<SearchKind>('song')
  const keyword = ref('')
  const active = ref(false)
  const buckets = reactive<Record<SearchKind, Bucket>>({
    song: emptyBucket(),
    album: emptyBucket(),
    songlist: emptyBucket(),
  })

  const seqs: Record<SearchKind, number> = { song: 0, album: 0, songlist: 0 }
  const controllers: Record<SearchKind, AbortController | null> = {
    song: null,
    album: null,
    songlist: null,
  }

  const current = computed(() => buckets[kind.value])
  const items = computed(() => current.value.items)
  const page = computed(() => current.value.page)
  const total = computed(() => current.value.total)
  const loading = computed(() => current.value.loading)
  const error = computed(() => current.value.error)
  const pages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

  function resetBuckets(): void {
    for (const k of KINDS) {
      controllers[k]?.abort()
      controllers[k] = null
      seqs[k] += 1
      Object.assign(buckets[k], emptyBucket())
    }
  }

  async function run(text: string, next = 1, target: SearchKind = kind.value): Promise<void> {
    const term = String(text ?? '').trim()
    if (!term) return

    if (term !== keyword.value) {
      resetBuckets()
      keyword.value = term
    }
    active.value = true

    const bucket = buckets[target]
    controllers[target]?.abort()
    const controller = new AbortController()
    controllers[target] = controller
    const token = ++seqs[target]
    bucket.loading = true
    bucket.error = ''

    try {
      const data = await fetcher(target)(term, next, PAGE_SIZE, controller.signal)
      if (token !== seqs[target]) return
      bucket.items = data.items ?? []
      bucket.page = data.page ?? next
      bucket.total = data.total ?? 0
      bucket.loaded = true
    } catch (error_) {
      if (token !== seqs[target] || isAbortError(error_)) return
      bucket.items = []
      bucket.total = 0
      bucket.loaded = false
      bucket.error = errText(error_)
    } finally {
      if (token === seqs[target]) bucket.loading = false
    }
  }

  /** 切页签：这一档在当前关键词下已有结果就直接用缓存，否则补一次请求 */
  async function setKind(next: SearchKind): Promise<void> {
    if (!KINDS.includes(next) || next === kind.value) return
    kind.value = next
    if (!keyword.value || buckets[next].loaded) return
    await run(keyword.value, 1, next)
  }

  function turn(next: number): void {
    if (!keyword.value || next < 1 || next > pages.value || next === page.value) return
    void run(keyword.value, next, kind.value)
  }

  function clear(): void {
    resetBuckets()
    keyword.value = ''
    kind.value = 'song'
    active.value = false
  }

  return {
    kind,
    keyword,
    items,
    page,
    total,
    loading,
    error,
    active,
    pages,
    pageSize: computed(() => PAGE_SIZE),
    run,
    setKind,
    turn,
    clear,
  }
})
