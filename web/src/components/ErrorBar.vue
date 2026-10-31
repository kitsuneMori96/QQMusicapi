<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useNoticeStore } from '@/stores/notice'

const notices = useNoticeStore()
</script>

<template>
  <transition-group name="notice" tag="div" class="notices">
    <div v-for="n in notices.items" :key="n.id" class="notice" :class="`notice--${n.level}`">
      <span class="notice__level label">{{ n.level }}</span>
      <div class="notice__body">
        <div class="notice__text">{{ n.text }}</div>
        <div v-if="n.detail" class="notice__detail">{{ n.detail }}</div>
        <RouterLink v-if="n.action" :to="n.action.to" class="notice__action">
          {{ n.action.label }}
        </RouterLink>
      </div>
      <button class="notice__close" aria-label="关闭" @click="notices.dismiss(n.id)">×</button>
    </div>
  </transition-group>
</template>

<style scoped>
.notices {
  position: fixed;
  left: var(--sp-4);
  bottom: calc(var(--statusbar-h) + var(--sp-3));
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  width: min(460px, calc(100vw - 2 * var(--sp-4)));
  pointer-events: none;
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
  margin-top: 2px;
  font-size: var(--fs-label);
  color: var(--text-faint);
  overflow-wrap: anywhere;
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

.notice-enter-active,
.notice-leave-active {
  transition: opacity 0.12s linear;
}

.notice-enter-from,
.notice-leave-to {
  opacity: 0;
}
</style>
