<script setup lang="ts">
import { formatDuration } from '@/lib/mid'
import {
  isAlbumItem,
  isSonglistItem,
  isSongItem,
  type SearchItem,
  type SearchKind,
} from '@/api/search'

const props = defineProps<{
  kind: SearchKind
  keyword: string
  items: SearchItem[]
  page: number
  pages: number
  total: number
  pageSize?: number
  loading?: boolean
  error?: string
  /** 正在解析的歌曲 mid（歌曲页签行高亮） */
  activeMid?: string
  /** 正在打开的合集 id（专辑/歌单页签行高亮） */
  activeId?: string
}>()

const emit = defineEmits<{
  kind: [kind: SearchKind]
  pick: [kind: SearchKind, id: string]
  page: [page: number]
  close: []
}>()

const TABS: Array<{ key: SearchKind; label: string }> = [
  { key: 'song', label: '歌曲' },
  { key: 'album', label: '专辑' },
  { key: 'songlist', label: '歌单' },
]

/** 行号接着上一页排，翻页时用户能看出这是同一轮结果 */
function rowNumber(index: number): string {
  return String((props.page - 1) * (props.pageSize ?? 20) + index + 1).padStart(2, '0')
}

function rowId(item: SearchItem): string {
  return isSonglistItem(item) ? item.id : item.mid
}

function rowActive(item: SearchItem): boolean {
  if (props.kind === 'song') return Boolean(props.activeMid && rowId(item) === props.activeMid)
  return Boolean(props.activeId && rowId(item) === props.activeId)
}

function rowName(item: SearchItem): string {
  return item.name || '—'
}

function rowSinger(item: SearchItem): string {
  return isSongItem(item) || isAlbumItem(item) ? item.singer || '—' : item.creator || '—'
}

function rowMeta(item: SearchItem): string {
  if (isSongItem(item)) return item.album || '—'
  return `${item.songNum} 首`
}

function rowTail(item: SearchItem): string {
  if (isSongItem(item)) return formatDuration(item.interval)
  if (isAlbumItem(item)) return item.publishDate || '—'
  return item.listenNumText || '—'
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
    <div class="panel-head search__head">
      <div class="search__tabs" role="tablist">
        <button
          v-for="tab in TABS"
          :key="tab.key"
          class="search__tab"
          :class="{ 'search__tab--on': tab.key === kind }"
          role="tab"
          :aria-selected="tab.key === kind"
          @click="emit('kind', tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>
      <span class="micro text-faint">「{{ keyword }}」</span>
      <span class="spacer" />
      <span v-if="loading" class="spinner" />
      <span v-else class="micro mono-num text-dim">{{ total }} 条</span>
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
        :key="rowId(item) || index"
        class="search__row"
        :class="[`search__row--${kind}`, { 'search__row--active': rowActive(item) }]"
        :disabled="rowActive(item)"
        @click="emit('pick', kind, rowId(item))"
        @keydown.down.prevent="moveFocus($event, 1)"
        @keydown.up.prevent="moveFocus($event, -1)"
      >
        <span class="search__idx mono-num">{{ rowNumber(index) }}</span>
        <span class="search__title">{{ rowName(item) }}</span>
        <span class="search__singer">{{ rowSinger(item) }}</span>
        <span class="search__meta">{{ rowMeta(item) }}</span>
        <span class="search__time mono-num">{{ rowTail(item) }}</span>
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

.search__head {
  gap: var(--sp-2);
}

.search__tabs {
  display: flex;
  gap: var(--sp-1);
}

.search__tab {
  padding: 1px var(--sp-2);
  border: 1px solid transparent;
  border-radius: 2px;
  color: var(--text-faint);
  font-size: var(--fs-micro);
  cursor: pointer;
}

.search__tab:hover {
  color: var(--text);
}

.search__tab--on {
  border-color: var(--line-strong);
  background: rgb(91 157 255 / 10%);
  color: var(--blue);
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

.search__row--album,
.search__row--songlist {
  grid-template-columns: 24px minmax(0, 1.6fr) minmax(0, 1fr) 56px 72px;
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

@keyframes skeleton {
  from {
    background-position: 200% 0;
  }

  to {
    background-position: -200% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-line {
    animation: none;
  }
}

.search__idx {
  color: var(--text-faint);
  font-size: var(--fs-label);
}

.search__title,
.search__singer,
.search__meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search__title {
  color: var(--text-dim);
}

.search__singer,
.search__meta {
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
</style>
