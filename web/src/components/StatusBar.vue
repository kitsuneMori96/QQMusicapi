<script setup lang="ts">
import { computed } from 'vue'
import { useStatusStore } from '@/stores/status'

const status = useStatusStore()

const phaseText = computed(() => {
  switch (status.phase) {
    case 'checking':
      return 'PROBING'
    case 'online':
      return 'ONLINE'
    case 'offline':
      return 'OFFLINE'
    default:
      return 'STANDBY'
  }
})

const dotClass = computed(() => {
  if (status.phase === 'online') return 'dot--on'
  if (status.phase === 'offline') return 'dot--off'
  if (status.phase === 'checking') return 'dot--busy'
  return ''
})

const checkedAt = computed(() => {
  if (!status.lastCheckedAt) return '—'
  const d = new Date(status.lastCheckedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
})

const loginText = computed(() => {
  if (status.phase !== 'online') return '—'
  if (!status.health?.loggedIn) return '未登录'
  return `已登录 ${status.health.musicid ?? ''}`.trim()
})
</script>

<template>
  <footer class="statusbar">
    <span class="statusbar__cell">
      <span class="dot" :class="dotClass" />
      <span class="label">服务</span>
      <span class="statusbar__value" :class="status.phase === 'offline' ? 'text-err' : ''">
        {{ phaseText }}
      </span>
      <span v-if="status.error" class="micro text-err statusbar__err">{{ status.error }}</span>
    </span>

    <span class="statusbar__cell">
      <span class="label">账号</span>
      <span class="statusbar__value">{{ loginText }}</span>
    </span>

    <span class="statusbar__cell">
      <span class="label">核心</span>
      <span class="statusbar__value" :class="status.health?.status === 'ok' ? 'text-ok' : ''">
        {{ status.health ? `v${status.health.version} · ${status.health.status}` : '—' }}
      </span>
    </span>

    <span class="statusbar__cell statusbar__cell--end">
      <span class="label" title="每 30s 自动探测；离线时退避重试，回到前台立即探测">探测</span>
      <span class="statusbar__value mono-num">{{ checkedAt }}</span>
      <span v-if="status.polling" class="micro text-faint">AUTO</span>
      <button class="statusbar__btn" :disabled="status.phase === 'checking'" @click="status.refresh()">
        重试
      </button>
    </span>
  </footer>
</template>

<style scoped>
.statusbar {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  height: var(--statusbar-h);
  padding: 0 var(--sp-4);
  background: var(--panel);
  border-top: var(--hairline);
  font-size: var(--fs-micro);
  overflow: hidden;
  white-space: nowrap;
}

.statusbar__cell {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}

.statusbar__cell--end {
  margin-left: auto;
}

.statusbar__value {
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
}

.statusbar__err {
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.statusbar__btn {
  height: 18px;
  padding: 0 var(--sp-2);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--text-dim);
  font-size: var(--fs-label);
  letter-spacing: 0.1em;
  cursor: pointer;
}

.statusbar__btn:hover:not(:disabled) {
  border-color: var(--blue);
  color: var(--blue);
}

.statusbar__btn:disabled {
  cursor: not-allowed;
  color: var(--text-faint);
}

@media (max-width: 760px) {
  .statusbar {
    gap: var(--sp-3);
    padding: 0 var(--sp-3);
  }

  .statusbar__cell:nth-child(3) {
    display: none;
  }
}
</style>
