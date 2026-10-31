<script setup lang="ts">
const props = defineProps<{
  items: Array<{ id?: number | string; mid?: string; name?: string; singer?: string }>
  loading?: boolean
  activeMid?: string
}>()

const emit = defineEmits<{
  select: [mid: string]
}>()

function isActive(item: { mid?: string }): boolean {
  return Boolean(item.mid && item.mid === props.activeMid)
}

function moveFocus(event: KeyboardEvent, step: number): void {
  const current = event.currentTarget as HTMLElement
  const host = current.parentElement
  if (!host) return
  const buttons = [
    ...host.querySelectorAll<HTMLButtonElement>('button.similar__row:not(:disabled)'),
  ]
  const index = buttons.indexOf(current as HTMLButtonElement)
  if (index < 0 || buttons.length === 0) return
  buttons[(index + step + buttons.length) % buttons.length]?.focus()
}
</script>

<template>
  <section class="panel similar">
    <div class="panel-head">
      <span class="label">相似曲目</span>
      <span class="spacer" />
      <span v-if="loading" class="spinner" />
      <span v-else class="micro mono-num text-dim">{{ items.length }}</span>
    </div>

    <div class="similar__list scroll-y">
      <template v-if="loading && items.length === 0">
        <div v-for="n in 3" :key="n" class="similar__row similar__row--skeleton">
          <span class="similar__idx mono-num">··</span>
          <span class="skeleton-line" />
          <span class="skeleton-line skeleton-line--short" />
        </div>
      </template>

      <button
        v-for="(item, index) in items"
        :key="item.mid ?? item.id ?? index"
        class="similar__row"
        :class="{ 'similar__row--active': isActive(item) }"
        :disabled="!item.mid || isActive(item)"
        @click="item.mid && emit('select', item.mid)"
        @keydown.down.prevent="moveFocus($event, 1)"
        @keydown.up.prevent="moveFocus($event, -1)"
      >
        <span class="similar__idx mono-num">{{ String(index + 1).padStart(2, '0') }}</span>
        <span class="similar__title">{{ item.name || '—' }}</span>
        <span class="similar__singer">{{ item.singer || '—' }}</span>
      </button>

      <p v-if="items.length === 0 && !loading" class="empty">暂无相似曲目</p>
    </div>
  </section>
</template>

<style scoped>
.similar {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.similar__list {
  max-height: 300px;
  min-height: 80px;
}

.similar__row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) minmax(0, 160px);
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

.similar__row:last-child {
  border-bottom: none;
}

.similar__row:hover:not(:disabled) .similar__title {
  color: var(--blue);
}

.similar__row:disabled {
  cursor: default;
}

.similar__row--active {
  background: rgb(91 157 255 / 8%);
}

.similar__row--active .similar__title,
.similar__row--active .similar__idx {
  color: var(--blue);
}

.similar__row--skeleton {
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

.similar__idx {
  color: var(--text-faint);
  font-size: var(--fs-label);
}

.similar__title,
.similar__singer {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.similar__title {
  color: var(--text-dim);
}

.similar__singer {
  color: var(--text-faint);
  text-align: right;
}
</style>
