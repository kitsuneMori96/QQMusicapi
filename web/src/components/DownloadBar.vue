<script setup lang="ts">
import { computed } from 'vue'
import { useDownloadsStore, type DownloadTask } from '@/stores/downloads'

const downloads = useDownloadsStore()

const visible = computed(() => downloads.tasks.slice(-5).reverse())

const STATUS_TEXT: Record<DownloadTask['status'], string> = {
  queued: '排队中',
  transferring: '下载中',
  done: '已保存',
  error: '失败',
  canceled: '已取消',
}

function statusText(task: DownloadTask): string {
  return STATUS_TEXT[task.status]
}

function pending(task: DownloadTask): boolean {
  return task.status === 'queued' || task.status === 'transferring'
}

function percent(task: DownloadTask): number | null {
  if (task.status === 'done') return 100
  const value = downloads.progressOf(task.id)
  return value < 0 ? null : Math.round(value * 100)
}

function bytes(value: number): string {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`
  return `${value} B`
}
</script>

<template>
  <aside v-if="visible.length > 0" class="dlbar" aria-live="polite">
    <header class="dlbar__head">
      <span class="label">下载</span>
      <span class="micro text-dim">{{ downloads.active.length }} 进行中</span>
      <span class="spacer" />
      <button class="dlbar__clear" title="清掉成功与取消的记录" @click="downloads.clearDone()">
        清理
      </button>
    </header>

    <ul class="dlbar__list">
      <li
        v-for="task in visible"
        :key="task.id"
        class="dl"
        :class="`dl--${task.status}`"
      >
        <div class="dl__line">
          <span class="dl__name" :title="task.label">
            {{ task.label }}
            <span class="dl__code">{{ task.code }}</span>
          </span>
          <span class="dl__status micro">{{ statusText(task) }}</span>
        </div>

        <div v-if="pending(task)" class="dl__track">
          <span
            v-if="percent(task) === null"
            class="dl__fill dl__fill--indeterminate"
          />
          <span v-else class="dl__fill" :style="{ width: `${percent(task)}%` }" />
        </div>

        <div class="dl__meta micro">
          <span v-if="task.status === 'transferring'">
            {{ percent(task) === null ? `已接收 ${bytes(task.received)}` : `${percent(task)}%` }}
          </span>
          <span v-else-if="task.status === 'done'" class="dl__ok" :title="task.filename">
            {{ task.filename }}
          </span>
          <span v-else-if="task.status === 'error'" class="dl__err" :title="task.error">
            {{ task.error }}
          </span>
          <span v-else-if="task.status === 'canceled'" class="text-faint">已取消</span>
          <span v-else class="text-faint">等待开始…</span>

          <span class="spacer" />

          <button v-if="pending(task)" class="dl__btn" @click="downloads.cancel(task.id)">
            取消
          </button>
          <button
            v-if="task.status === 'error' || task.status === 'canceled'"
            class="dl__btn"
            @click="downloads.retry(task.id)"
          >
            重试
          </button>
          <button
            v-if="!pending(task)"
            class="dl__btn"
            title="从列表移除"
            @click="downloads.dismiss(task.id)"
          >
            关闭
          </button>
        </div>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.dlbar {
  position: fixed;
  right: var(--sp-4);
  bottom: calc(var(--sp-4) + 22px);
  z-index: 40;
  width: min(360px, calc(100vw - 2 * var(--sp-4)));
  background: var(--panel);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  box-shadow: none;
}

.dlbar__head {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  height: 26px;
  padding: 0 var(--sp-2) 0 var(--sp-3);
  border-bottom: var(--hairline);
}

.dlbar__clear {
  height: 17px;
  padding: 0 4px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--text-dim);
  font-size: var(--fs-label);
  cursor: pointer;
}

.dlbar__clear:hover {
  border-color: var(--blue);
  color: var(--blue);
}

.dlbar__list {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 240px;
  overflow-y: auto;
}

.dl {
  padding: var(--sp-2) var(--sp-3);
  border-bottom: 1px dashed rgb(42 47 54 / 55%);
  font-size: var(--fs-micro);
}

.dl:last-child {
  border-bottom: none;
}

.dl__line {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.dl__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
}

.dl__code {
  margin-left: 4px;
  color: var(--text-faint);
  font-size: var(--fs-label);
  letter-spacing: 0.04em;
}

.dl__status {
  flex: none;
  color: var(--text-dim);
}

.dl--done .dl__status {
  color: var(--ok);
}

.dl--error .dl__status {
  color: var(--err);
}

.dl--canceled .dl__status {
  color: var(--text-faint);
}

.dl__track {
  position: relative;
  height: 2px;
  margin-top: var(--sp-2);
  overflow: hidden;
  background: var(--line);
}

.dl__fill {
  display: block;
  height: 100%;
  background: var(--blue);
  transition: width 200ms linear;
}

.dl__fill--indeterminate {
  width: 40%;
  animation: dl-slide 900ms linear infinite;
}

@keyframes dl-slide {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(250%);
  }
}

.dl__meta {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-top: 4px;
  min-height: 17px;
  color: var(--text-dim);
}

.dl__meta > span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dl__ok {
  color: var(--ok);
}

.dl__err {
  color: var(--err);
}

.dl__btn {
  flex: none;
  height: 17px;
  padding: 0 4px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--text-dim);
  font-size: var(--fs-label);
  cursor: pointer;
}

.dl__btn:hover {
  border-color: var(--blue);
  color: var(--blue);
}
</style>
