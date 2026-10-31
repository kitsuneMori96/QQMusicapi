<script setup lang="ts">
defineProps<{
  items: Array<{ id?: number; mid?: string; name?: string; singer?: string }>
  loading?: boolean
}>()

const emit = defineEmits<{
  select: [mid: string]
}>()
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
      <button
        v-for="(item, index) in items"
        :key="item.mid ?? item.id ?? index"
        class="similar__row"
        :disabled="!item.mid"
        @click="item.mid && emit('select', item.mid)"
      >
        <span class="similar__idx mono-num">{{ String(index + 1).padStart(2, '0') }}</span>
        <span class="similar__title">{{ item.name || '—' }}</span>
        <span class="similar__singer">{{ item.singer || '—' }}</span>
      </button>

      <p v-if="items.length === 0" class="empty">{{ loading ? '加载中…' : '暂无相似曲目' }}</p>
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
