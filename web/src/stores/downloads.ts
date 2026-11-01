import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ApiError, isAbortError, isAuthError } from '@/api/http'
import { downloadSong } from '@/api/song'

export type DownloadStatus = 'queued' | 'transferring' | 'done' | 'error' | 'canceled'

export interface DownloadTask {
  id: string
  mid: string
  /** 音质档位 code，如 F000 */
  code: string
  /** 展示名（曲目名），缺省为 mid · code */
  label: string
  /** 实际落盘文件名，成功后才有值 */
  filename: string
  status: DownloadStatus
  /** 已接收字节 */
  received: number
  /** 总字节；0 表示响应没带 Content-Length，无法计算百分比 */
  total: number
  /** 失败原因文案；其余状态为空串 */
  error: string
}

export interface StartDownloadInput {
  mid: string
  code: string
  label?: string
}

let seq = 0

/** 尚未结束（还能取消）的状态 */
function isPending(status: DownloadStatus): boolean {
  return status === 'queued' || status === 'transferring'
}

/**
 * 下载任务表。start 立刻返回任务 id 并在后台取流，失败不抛出——
 * 反馈面是下载条，调用方只看任务状态。
 */
export const useDownloadsStore = defineStore('downloads', () => {
  const tasks = ref<DownloadTask[]>([])
  const controllers = new Map<string, AbortController>()

  const active = computed(() => tasks.value.filter((t) => isPending(t.status)))
  const last = computed(() => tasks.value[tasks.value.length - 1] ?? null)

  function find(id: string): DownloadTask | undefined {
    return tasks.value.find((t) => t.id === id)
  }

  /** 同一首歌同一档位只允许一个在途任务，重复点击复用而不重发请求 */
  function inFlight(mid: string, code: string): DownloadTask | undefined {
    return tasks.value.find((t) => t.mid === mid && t.code === code && isPending(t.status))
  }

  /** 0..1；total 未知（响应无 Content-Length）时返回 -1 */
  function progressOf(id: string): number {
    const task = find(id)
    if (!task || task.total <= 0) return -1
    return Math.min(1, task.received / task.total)
  }

  // 必须通过 find 拿到的代理改状态：直接改原始对象不会触发响应式更新
  function patch(id: string, changes: Partial<DownloadTask>): void {
    const task = find(id)
    if (task) Object.assign(task, changes)
  }

  async function run(id: string): Promise<void> {
    const task = find(id)
    if (!task) return

    const controller = new AbortController()
    controllers.set(id, controller)
    patch(id, { status: 'transferring', received: 0, total: 0, error: '' })

    try {
      const filename = await downloadSong({
        mid: task.mid,
        code: task.code,
        signal: controller.signal,
        onProgress: (progress) => patch(id, { received: progress.received, total: progress.total }),
      })
      patch(id, { status: 'done', filename, error: '' })
    } catch (error) {
      if (isAbortError(error)) {
        patch(id, { status: 'canceled', error: '' })
        return
      }
      const message = error instanceof ApiError ? error.message : String(error)
      // 会话失效的全局提示由 main.ts 的 handler 负责，这里只标注任务本身
      patch(id, {
        status: 'error',
        error: isAuthError(error) ? `登录状态已失效：${message}` : message,
      })
    } finally {
      controllers.delete(id)
    }
  }

  function start(input: StartDownloadInput): string {
    const existing = inFlight(input.mid, input.code)
    if (existing) return existing.id

    seq += 1
    const task: DownloadTask = {
      id: `dl-${seq}`,
      mid: input.mid,
      code: input.code,
      label: input.label ?? `${input.mid} · ${input.code}`,
      filename: '',
      status: 'queued',
      received: 0,
      total: 0,
      error: '',
    }
    tasks.value.push(task)
    void run(task.id)
    return task.id
  }

  function cancel(id: string): void {
    const task = find(id)
    if (!task || !isPending(task.status)) return
    controllers.get(id)?.abort()
    // 请求可能已经落地，由 run 的 catch 收尾；这里先置状态避免 UI 卡在 transferring
    patch(id, { status: 'canceled' })
  }

  function retry(id: string): void {
    const task = find(id)
    if (!task || isPending(task.status)) return
    patch(id, { status: 'queued', received: 0, total: 0, error: '', filename: '' })
    void run(id)
  }

  function dismiss(id: string): void {
    const task = find(id)
    if (!task || isPending(task.status)) return
    tasks.value = tasks.value.filter((t) => t.id !== id)
  }

  /** 清掉成功与取消的记录，失败留在下载条上等用户重试 */
  function clearDone(): void {
    tasks.value = tasks.value.filter((t) => isPending(t.status) || t.status === 'error')
  }

  return {
    tasks,
    active,
    last,
    start,
    cancel,
    retry,
    dismiss,
    clearDone,
    inFlight,
    progressOf,
  }
})
