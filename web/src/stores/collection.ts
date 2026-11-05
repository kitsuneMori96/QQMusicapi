import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { isAbortError } from '@/api/http'
import { albumDetail, songlistDetail, type CollectionKind } from '@/api/collection'
import type { AlbumDetailData, CollectionTrack, SonglistDetailData } from '@/api/contracts'
import { coverUrl } from '@/lib/mid'

const ALBUM_PAGE = 50
const SONGLIST_PAGE = 30

function errText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 合集详情：一次只开一个专辑或歌单，曲目「加载更多」追加而不是翻页。
 * 打开新的合集 abort 上一次请求，seq 令牌兜底丢弃过期结果。
 */
export const useCollectionStore = defineStore('collection', () => {
  const kind = ref<CollectionKind | null>(null)
  const id = ref('')
  const name = ref('')
  const sub = ref('')
  const cover = ref('')
  const desc = ref('')
  const total = ref(0)
  const items = ref<CollectionTrack[]>([])
  const page = ref(0)
  const hasMore = ref(false)
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref('')
  const active = computed(() => Boolean(kind.value && id.value))

  let seq = 0
  let controller: AbortController | null = null

  function applyHeader(data: AlbumDetailData | SonglistDetailData): void {
    name.value = data.name
    desc.value = data.desc ?? ''
    if (kind.value === 'album') {
      const album = data as AlbumDetailData
      sub.value = [album.singer, album.publishDate].filter(Boolean).join(' · ')
      cover.value = coverUrl(album.mid)
    } else {
      const list = data as SonglistDetailData
      sub.value = list.creator
      cover.value = list.cover
    }
  }

  function pageSizeOf(): number {
    return kind.value === 'album' ? ALBUM_PAGE : SONGLIST_PAGE
  }

  function fetchPage(target: string, next: number, signal?: AbortSignal) {
    return kind.value === 'album'
      ? albumDetail(target, next, ALBUM_PAGE, signal)
      : songlistDetail(target, next, SONGLIST_PAGE, signal)
  }

  async function open(nextKind: CollectionKind, nextId: string): Promise<void> {
    const target = String(nextId ?? '').trim()
    if (!target) return
    if (kind.value === nextKind && id.value === target && (items.value.length > 0 || loading.value)) {
      return
    }

    controller?.abort()
    controller = new AbortController()
    const token = ++seq
    kind.value = nextKind
    id.value = target
    name.value = ''
    sub.value = ''
    cover.value = ''
    desc.value = ''
    total.value = 0
    items.value = []
    page.value = 0
    hasMore.value = false
    loading.value = true
    loadingMore.value = false
    error.value = ''

    try {
      const data = await fetchPage(target, 1, controller.signal)
      if (token !== seq) return
      applyHeader(data)
      items.value = data.items ?? []
      page.value = data.page ?? 1
      total.value = data.total ?? 0
      hasMore.value = Boolean(data.hasMore)
    } catch (error_) {
      if (token !== seq || isAbortError(error_)) return
      items.value = []
      error.value = errText(error_)
    } finally {
      if (token === seq) loading.value = false
    }
  }

  async function loadMore(): Promise<void> {
    if (!active.value || loading.value || loadingMore.value || !hasMore.value) return
    const token = seq
    const target = id.value
    const next = page.value + 1
    loadingMore.value = true
    error.value = ''
    try {
      const data = await fetchPage(target, next)
      if (token !== seq) return
      items.value = [...items.value, ...(data.items ?? [])]
      page.value = data.page ?? next
      hasMore.value = Boolean(data.hasMore)
    } catch (error_) {
      if (token !== seq || isAbortError(error_)) return
      error.value = errText(error_)
    } finally {
      if (token === seq) loadingMore.value = false
    }
  }

  function close(): void {
    controller?.abort()
    controller = null
    seq += 1
    kind.value = null
    id.value = ''
    name.value = ''
    sub.value = ''
    cover.value = ''
    desc.value = ''
    total.value = 0
    items.value = []
    page.value = 0
    hasMore.value = false
    loading.value = false
    loadingMore.value = false
    error.value = ''
  }

  return {
    kind,
    id,
    name,
    sub,
    cover,
    desc,
    total,
    items,
    page,
    hasMore,
    loading,
    loadingMore,
    error,
    active,
    pageSize: computed(pageSizeOf),
    open,
    loadMore,
    close,
  }
})
