<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useNoticeStore } from '@/stores/notice'

const notices = useNoticeStore()
const expanded = ref<Set<number>>(new Set())

function toggle(id: number): void {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

function expandable(detail?: string): boolean {
  return Boolean(detail && detail.length > 60)
}
</script>

<template>
  <div class="notices" role="status" aria-live="polite">
    <transition-group name="notice" tag="div" class="notices__stack">
      <div v-for="n in notices.items" :key="n.id" class="notice" :class="`notice--${n.level}`">
        <span class="notice__level label">{{ n.level }}</span>
        <div class="notice__body">
          <div class="notice__text">{{ n.text }}</div>
          <div
            v-if="n.detail"
            class="notice__detail"
            :class="{ 'notice__detail--open': expanded.has(n.id) }"
          >
            {{ n.detail }}
          </div>
          <button
            v-if="expandable(n.detail)"
            class="notice__toggle"
            :aria-expanded="expanded.has(n.id)"
            @click="toggle(n.id)"
          >
            {{ expanded.has(n.id) ? '收起' : '展开' }}
          </button>
          <RouterLink v-if="n.action" :to="n.action.to" class="notice__action">
            {{ n.action.label }}
          </RouterLink>
        </div>
        <button class="notice__close" aria-label="关闭" @click="notices.dismiss(n.id)">×</button>
      </div>
    </transition-group>
    <button v-if="notices.items.length > 1" class="notices__clear" @click="notices.clear()">
      全部关闭
    </button>
  </div>
</template>

<style scoped>
.notices {
  position: fixed;
  left: var(--sp-4);
  bottom: calc(var(--statusbar-h) + var(--sp-3));
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sp-2);
  width: min(460px, calc(100vw - 2 * var(--sp-4)));
  pointer-events: none;
}

.notices__stack {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  width: 100%;
}

.notice {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  background: var(--panel-raised);
  border: 1px solid var(--line-strong);
  border-left: 2px solid var(--text-faint);
  border-radius: var(--radius);
  pointer-events: auto;
}

.notice--ok {
  border-left-color: var(--ok);
}

.notice--warn {
  border-left-color: var(--warn);
}

.notice--error {
  border-left-color: var(--err);
}

.notice--info {
  border-left-color: var(--blue);
}

.notice__level {
  flex: none;
  min-width: 40px;
  padding-top: 1px;
  font-size: var(--fs-label);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.notice--ok .notice__level {
  color: var(--ok);
}

.notice--warn .notice__level {
  color: var(--warn);
}

.notice--error .notice__level {
  color: var(--err);
}

.notice__body {
  flex: 1;
  min-width: 0;
}

.notice__text {
  font-size: var(--fs-micro);
  overflow-wrap: anywhere;
}

.notice__detail {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  margin-top: 2px;
  font-size: var(--fs-label);
  color: var(--text-faint);
  overflow: hidden;
  overflow-wrap: anywhere;
}

.notice__detail--open {
  display: block;
  -webkit-line-clamp: unset;
}

.notice__toggle {
  margin-top: 2px;
  font-size: var(--fs-label);
  letter-spacing: 0.08em;
  color: var(--text-dim);
  border-bottom: 1px dotted var(--line-strong);
  cursor: pointer;
}

.notice__toggle:hover {
  color: var(--text);
}

.notice__action {
  display: inline-block;
  margin-top: var(--sp-1);
  font-size: var(--fs-label);
  letter-spacing: 0.08em;
  color: var(--blue);
}

.notice__close {
  flex: none;
  width: 16px;
  height: 16px;
  line-height: 1;
  color: var(--text-faint);
  cursor: pointer;
}

.notice__close:hover {
  color: var(--text);
}

.notices__clear {
  padding: 2px var(--sp-2);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--panel);
  color: var(--text-faint);
  font-size: var(--fs-label);
  letter-spacing: 0.08em;
  cursor: pointer;
  pointer-events: auto;
}

.notices__clear:hover {
  border-color: var(--line-strong);
  color: var(--text);
}

.notice-enter-active,
.notice-leave-active {
  transition: opacity 0.12s linear;
}

.notice-enter-from,
.notice-leave-to {
  opacity: 0;
}
</style>
