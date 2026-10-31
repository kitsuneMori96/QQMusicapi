<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import StatusBar from './StatusBar.vue'
import ErrorBar from './ErrorBar.vue'
import { useStatusStore } from '@/stores/status'

const status = useStatusStore()

onMounted(() => {
  void status.refresh()
})
</script>

<template>
  <div class="shell">
    <header class="shell__bar">
      <RouterLink to="/" class="brand">
        <span class="brand__mark">▚</span>
        <span class="brand__name">QQMUSIC</span>
        <span class="brand__sep">//</span>
        <span class="brand__suffix">TERMINAL</span>
      </RouterLink>

      <nav class="nav">
        <RouterLink to="/" class="nav__link">解析</RouterLink>
        <RouterLink to="/login" class="nav__link">登录</RouterLink>
      </nav>

      <div class="bar__right">
        <span class="micro text-faint">v{{ status.health?.version ?? '—' }}</span>
        <span class="tag" :class="status.loggedIn ? 'tag--ok' : ''">
          <span class="dot" :class="status.loggedIn ? 'dot--on' : 'dot--off'" />
          {{ status.loggedIn ? 'AUTH' : 'ANON' }}
        </span>
      </div>
    </header>

    <main class="shell__main">
      <RouterView />
    </main>

    <StatusBar />
    <ErrorBar />
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100%;
  min-height: 100%;
}

.shell__bar {
  display: flex;
  align-items: center;
  gap: var(--sp-5);
  height: 38px;
  padding: 0 var(--sp-4);
  background: var(--panel);
  border-bottom: var(--hairline);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
  font-size: var(--fs-micro);
  letter-spacing: 0.12em;
  text-decoration: none;
}

.brand:hover {
  text-decoration: none;
  color: var(--text);
}

.brand__mark {
  color: var(--blue);
}

.brand__name {
  font-weight: 600;
}

.brand__sep,
.brand__suffix {
  color: var(--text-faint);
}

.nav {
  display: flex;
  gap: 2px;
}

.nav__link {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 var(--sp-3);
  border: 1px solid transparent;
  border-radius: var(--radius);
  color: var(--text-dim);
  font-size: var(--fs-micro);
  letter-spacing: 0.08em;
  text-decoration: none;
}

.nav__link:hover {
  color: var(--text);
  text-decoration: none;
}

.nav__link.router-link-active {
  color: var(--blue);
  border-color: var(--line-strong);
  background: var(--panel-sunken);
}

.bar__right {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  margin-left: auto;
}

.shell__main {
  min-height: 0;
  overflow-y: auto;
  padding: var(--sp-4);
}

@media (max-width: 640px) {
  .shell__bar {
    gap: var(--sp-3);
    padding: 0 var(--sp-3);
  }

  .shell__main {
    padding: var(--sp-3);
  }
}
</style>
