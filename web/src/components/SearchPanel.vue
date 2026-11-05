<script setup lang="ts">
import type { SongSearchItem } from '@/api/contracts'
import { formatDuration } from '@/lib/mid'

const props = defineProps<{
  keyword: string
  items: SongSearchItem[]
  page: number
  pages: number
  total: number
  pageSize?: number
  loading?: boolean
  error?: string
  activeMid?: string
}>()

const emit = defineEmits<{
  select: [mid: string]
  page: [page: number]
  close: []
}>()

/** 行号接着上一页排，翻页时用户能看出这是同一轮结果 */
function rowNumber(index: number): string {
  return String((props.page - 1) * (props.pageSize ?? 20) + index + 1).padStart(2, '0')
}

function isActive(item: SongSearchItem): boolean {
  return Boolean(item.mid && item.mid === props.activeMid)
}

function moveFocus(event: KeyboardEvent, step: number): void {
  const current = event.currentTarget as HTMLElement
  const host = current.parentElement
  if (!host) return
  const buttons = [
    ...host.querySelectorAll<HTMLButtonElement>('button.search__row:not(:disabled)'),
  ]
  const index = buttons.indexOf(current as HTMLButtonElement)
  if (index < 0 || buttons.length === 0) return
  buttons[(index + step + buttons.length) % buttons.length]?.focus()
}
</script>

<template>
  <section class="panel search">
    <div class="panel-head">
      <span class="label">搜索</span>
      <span class="micro text-faint">「{{ keyword }}」</span>
      <span class="spacer" />
      <span v-if="loading" class="spinner" />
      <span v-else class="micro mono-num text-dim">{{ total }} 首</span>
      <button class="search__close" aria-label="关闭搜索结果" @click="emit('close')">×</button>
    </div>

    <div class="search__list scroll-y">
      <template v-if="loading && items.length === 0">
        <div v-for="n in 4" :key="n" class="search__row search__row--skeleton">
          <span class="search__idx mono-num">··</span>
          <span class="skeleton-line" />
          <span class="skeleton-line skeleton-line--short" />
        </div>
      </template>

      <button
        v-for="(item, index) in items"
        :key="item.mid || index"
        class="search__row"
        :class="{ 'search__row--active': isActive(item) }"
        :disabled="isActive(item)"
        @click="emit('select', item.mid)"
        @keydown.down.prevent="moveFocus($event, 1)"
        @keydown.up.prevent="moveFocus($event, -1)"
      >
        <span class="search__idx mono-num">{{ rowNumber(index) }}</span>
        <span class="search__title">{{ item.name || '—' }}</span>
        <span class="search__singer">{{ item.singer || '—' }}</span>
        <span class="search__album">{{ item.album || '—' }}</span>
        <span class="search__time mono-num">{{ formatDuration(item.interval) }}</span>
      </button>

      <p v-if="error" class="empty text-err">{{ error }}</p>
      <p v-else-if="items.length === 0 && !loading" class="empty">
        没搜到「{{ keyword }}」，换个关键词试试
      </p>
    </div>

    <div v-if="pages > 1" class="search__pager">
      <button class="btn btn--ghost" :disabled="loading || page <= 1" @click="emit('page', page - 1)">
        ← 上一页
      </button>
      <span class="micro mono-num text-faint">{{ page }} / {{ pages }}</span>
      <button
        class="btn btn--ghost"
        :disabled="loading || page >= pages"
        @click="emit('page', page + 1)"
      >
        下一页 →
      </button>
    </div>
  </section>
</template>

<style scoped>
.search {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.search__list {
  max-height: 300px;
  min-height: 80px;
}

.search__row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) 48px;
  gap: var(--sp-2);
  align-items: center;
  width: 100%;
  min-height: 24px;
  padding: 0 var(--sp-3);
  border-bottom: 1px dashed rgb(42 47 54 / 55%);
  text-align: left;
  font-size: var(--fs-micro);
  cursor: pointer;
}

.search__row:last-child {
  border-bottom: none;
}

.search__row:hover:not(:disabled) .search__title {
  color: var(--blue);
}

.search__row:disabled {
  cursor: default;
}

.search__row--active {
  background: rgb(91 157 255 / 8%);
}

.search__row--active .search__title,
.search__row--active .search__idx {
  color: var(--blue);
}

.search__row--skeleton {
  cursor: default;
}

.search__idx {
  color: var(--text-faint);
  font-size: var(--fs-label);
}

.search__title,
.search__singer,
.search__album {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search__title {
  color: var(--text-dim);
}

.search__singer,
.search__album {
  color: var(--text-faint);
}

.search__time {
  color: var(--text-faint);
  text-align: right;
}

.search__close {
  width: 18px;
  height: 18px;
  color: var(--text-faint);
  font-size: var(--fs-body);
  line-height: 1;
  cursor: pointer;
}

.search__close:hover {
  color: var(--text);
}

.search__pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  border-top: var(--hairline);
}

.skeleton-line {
  height: 8px;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--line) 25%, var(--line-strong) 50%, var(--line) 75%);
  background-size: 200% 100%;
  animation: skeleton 1.4s linear infinite;
}

.skeleton-line--short {
  width: 60%;
  justify-self: end;
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-line {
    animation: none;
  }
}
</style>
