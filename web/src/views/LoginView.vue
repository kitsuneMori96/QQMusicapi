<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { useLoginStore, QR_HINT } from '@/stores/login'
import { useStatusStore } from '@/stores/status'

const login = useLoginStore()
const status = useStatusStore()

const qrHint = computed(() => QR_HINT[login.qrEvent])
const qrClass = computed(() => {
  switch (login.qrEvent) {
    case 'DONE':
      return 'qr__state--ok'
    case 'SCAN':
    case 'CONF':
      return 'qr__state--warn'
    case 'REFUSE':
    case 'TIMEOUT':
    case 'ERROR':
      return 'qr__state--err'
    default:
      return ''
  }
})

onBeforeUnmount(() => {
  // 二维码 2s 轮询 / 验证码倒计时都在这里统一清理
  login.clearTimers()
})
</script>

<template>
  <div class="login">
    <div class="grid-2 login__grid">
      <section class="panel">
        <div class="panel-head">
          <span class="label">会话</span>
          <span class="spacer" />
          <span class="tag" :class="status.loggedIn ? 'tag--ok' : 'tag--err'">
            {{ status.loggedIn ? '已登录' : '未登录' }}
          </span>
        </div>
        <div class="panel-body">
          <dl class="session">
            <div class="kv">
              <dt>musicid</dt>
              <dd class="mono-num">{{ status.health?.musicid ?? '—' }}</dd>
            </div>
            <div class="kv">
              <dt>服务</dt>
              <dd>{{ status.health ? `v${status.health.version}` : '—' }}</dd>
            </div>
            <div class="kv">
              <dt>凭证</dt>
              <dd class="text-faint">待接入 /login/status</dd>
            </div>
          </dl>

          <div class="actions">
            <button class="btn" :disabled="status.phase === 'checking'" @click="status.refresh()">刷新状态</button>
            <button class="btn" disabled>刷新凭证</button>
            <button class="btn btn--danger" disabled>退出登录</button>
          </div>
          <p class="micro text-faint login__todo">凭证操作接口待接入</p>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <span class="label">用户</span>
          <span class="spacer" />
          <span class="tag">PROFILE</span>
        </div>
        <div class="panel-body">
          <div class="profile">
            <div class="profile__avatar label text-faint">?</div>
            <div class="profile__main">
              <div class="profile__name">{{ status.loggedIn ? '待接入 /user/self' : '未登录' }}</div>
              <div class="profile__tags">
                <span class="tag">QQ {{ status.health?.musicid ?? '—' }}</span>
              </div>
            </div>
          </div>
          <p class="micro text-faint login__todo">头像 / 昵称 / 会员信息待接入</p>
        </div>
      </section>

      <section class="panel login__method">
        <div class="panel-head">
          <span class="label">登录方式</span>
          <div class="tabs">
            <button
              class="tabs__btn"
              :class="{ 'tabs__btn--active': login.tab === 'qr' }"
              @click="login.tab = 'qr'"
            >
              QQ 二维码
            </button>
            <button
              class="tabs__btn"
              :class="{ 'tabs__btn--active': login.tab === 'phone' }"
              @click="login.tab = 'phone'"
            >
              手机验证码
            </button>
          </div>
        </div>

        <div v-if="login.tab === 'qr'" class="panel-body qr">
          <div class="qr__box">
            <img v-if="login.qrImageUrl" :src="login.qrImageUrl" alt="QQ 登录二维码" />
            <span v-else class="label text-faint">QR PENDING</span>
          </div>
          <div class="qr__side">
            <div class="qr__state" :class="qrClass">{{ qrHint }}</div>
            <ol class="qr__legend">
              <li><span class="text-faint">SCAN</span> 已扫码，等待确认</li>
              <li><span class="text-faint">CONF</span> 已确认，等待授权</li>
              <li><span class="text-faint">DONE</span> 登录成功</li>
              <li><span class="text-faint">TIMEOUT</span> 二维码过期，需刷新</li>
            </ol>
            <button class="btn" disabled>刷新二维码</button>
            <p class="micro text-faint">二维码接口待接入（2s 轮询状态机已就位）</p>
          </div>
        </div>

        <div v-else class="panel-body phone">
          <div class="phone__row">
            <span class="label">国码</span>
            <input v-model="login.countryCode" class="input input--num" inputmode="numeric" />
            <span class="label">手机号</span>
            <input v-model="login.phone" class="input" inputmode="tel" placeholder="11 位手机号" />
          </div>
          <div class="phone__row">
            <span class="label">验证码</span>
            <input v-model="login.authcode" class="input" inputmode="numeric" placeholder="6 位验证码" />
            <button class="btn" :disabled="true">发送验证码</button>
            <span class="micro mono-num text-dim phone__countdown">
              {{ login.countdown > 0 ? `${login.countdown}s` : '' }}
            </span>
          </div>
          <div class="actions">
            <button class="btn btn--primary" disabled>登录</button>
          </div>
          <p class="micro text-faint">手机登录接口待接入</p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.login {
  max-width: 1240px;
  margin: 0 auto;
}

.login__grid {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: start;
}

.login__method {
  grid-column: 1 / -1;
}

.session {
  margin: 0 0 var(--sp-3);
}

.actions {
  display: flex;
  gap: var(--sp-2);
  margin-top: var(--sp-3);
}

.login__todo {
  margin: var(--sp-2) 0 0;
}

.profile {
  display: flex;
  gap: var(--sp-3);
  align-items: center;
}

.profile__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  flex: none;
  background: var(--panel-sunken);
  border: var(--hairline);
  border-radius: var(--radius);
  font-size: 20px;
}

.profile__name {
  font-size: var(--fs-title);
  color: var(--text-dim);
}

.profile__tags {
  display: flex;
  gap: var(--sp-2);
  margin-top: var(--sp-1);
}

.tabs {
  display: flex;
  gap: 2px;
  margin-left: auto;
}

.tabs__btn {
  height: 20px;
  padding: 0 var(--sp-2);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--text-faint);
  font-size: var(--fs-label);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.tabs__btn--active {
  color: var(--blue);
  border-color: rgb(91 157 255 / 45%);
  background: var(--panel-sunken);
}

.qr {
  display: flex;
  gap: var(--sp-5);
}

.qr__box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 168px;
  height: 168px;
  flex: none;
  background: var(--panel-sunken);
  border: var(--hairline);
  border-radius: var(--radius);
}

.qr__box img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.qr__side {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  align-items: flex-start;
  min-width: 0;
}

.qr__state {
  padding: 2px 6px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  font-size: var(--fs-micro);
  color: var(--text-dim);
}

.qr__state--ok {
  border-color: rgb(62 207 142 / 45%);
  color: var(--ok);
}

.qr__state--warn {
  border-color: rgb(242 193 78 / 45%);
  color: var(--warn);
}

.qr__state--err {
  border-color: rgb(255 107 107 / 45%);
  color: var(--err);
}

.qr__legend {
  margin: 0;
  padding-left: 16px;
  font-size: var(--fs-label);
  color: var(--text-faint);
  line-height: 1.6;
}

.phone {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.phone__row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.phone__countdown {
  min-width: 32px;
}

@media (max-width: 900px) {
  .qr {
    flex-direction: column;
  }
}
</style>
