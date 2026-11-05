import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { isAbortError } from '@/api/http'
import { searchSong } from '@/api/search'
import type { SongSearchItem } from '@/api/contracts'

function errText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 关键词搜索：输入既不是 mid 也不是分享链接时才用它，结果点一条即交回解析流。
 * 新一轮请求 abort 上一轮，seq 令牌兜底丢弃过期响应；错误就地渲染，不占通知条。
 */
export const useSearchStore = defineStore('search', () => {
  const PAGE_SIZE = 20

  const keyword = ref('')
  const items = ref<SongSearchItem[]>([])
  const page = ref(1)
  const total = ref(0)
  const loading = ref(false)
  const error = ref('')
  /** 是否展示搜索面板：跑过一次搜索就为 true，直到 clear */
  const active = ref(false)

  let seq = 0
  let controller: AbortController | null = null

  const pages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

  async function run(text: string, next = 1): Promise<void> {
    const term = String(text ?? '').trim()
    if (!term) return

    controller?.abort()
    controller = new AbortController()
    const token = ++seq
    keyword.value = term
    active.value = true
    loading.value = true
    error.value = ''
    try {
      const data = await searchSong(term, next, PAGE_SIZE, controller.signal)
      if (token !== seq) return
      items.value = data.items ?? []
      page.value = data.page ?? next
      total.value = data.total ?? 0
    } catch (error_) {
      if (token !== seq || isAbortError(error_)) return
      items.value = []
      total.value = 0
      error.value = errText(error_)
    } finally {
      if (token === seq) loading.value = false
    }
  }

  function turn(next: number): void {
    if (!keyword.value || next < 1 || next > pages.value || next === page.value) return
    void run(keyword.value, next)
  }

  function clear(): void {
    controller?.abort()
    controller = null
    seq += 1
    keyword.value = ''
    items.value = []
    page.value = 1
    total.value = 0
    loading.value = false
    error.value = ''
    active.value = false
  }

  return {
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
    turn,
    clear,
  }
})
