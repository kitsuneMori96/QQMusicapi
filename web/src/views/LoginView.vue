<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { QR_HINT, useLoginStore } from '@/stores/login'
import UserCard from '@/components/UserCard.vue'

const login = useLoginStore()

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

const qrHint = computed(() => (login.qrError && login.qrEvent === 'ERROR' ? `获取二维码失败: ${login.qrError}` : QR_HINT[login.qrEvent]))

const actionsBusy = computed(() => login.credentialBusy || login.sessionLoading)

function confirmLogout(): void {
  if (!window.confirm('确定要退出登录吗？')) return
  void login.logout()
}

watch(
  () => login.tab,
  (tab) => {
    if (tab === 'qr' && !login.identifier && !login.loggedIn) void login.loadQr()
  },
)

onMounted(async () => {
  await login.refreshStatus()
  if (!login.loggedIn) await login.loadQr()
})

onBeforeUnmount(() => {
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
          <span v-if="login.sessionLoading" class="spinner" />
          <span v-else class="tag" :class="login.loggedIn ? 'tag--ok' : 'tag--err'">
            {{ login.loggedIn ? '已登录' : '未登录' }}
          </span>
        </div>
        <div class="panel-body">
          <dl class="session">
            <div class="kv">
              <dt>musicid</dt>
              <dd class="mono-num">{{ login.session?.musicid ?? '—' }}</dd>
            </div>
            <div class="kv">
              <dt>凭证过期</dt>
              <dd :class="login.session?.expired ? 'text-warn' : 'text-ok'">
                {{ login.session ? (login.session.expired ? '是' : '否') : '—' }}
              </dd>
            </div>
            <div class="kv">
              <dt>凭证文件</dt>
              <dd class="session__file">{{ login.session?.file ?? '—' }}</dd>
            </div>
          </dl>

          <div class="actions">
            <button class="btn" :disabled="actionsBusy" @click="login.refreshStatus()">刷新状态</button>
            <button
              class="btn"
              :disabled="actionsBusy || !login.loggedIn"
              @click="login.refreshCredential()"
            >
              刷新凭证
            </button>
            <button
              class="btn btn--danger"
              :disabled="actionsBusy || !login.loggedIn"
              @click="confirmLogout"
            >
              退出登录
            </button>
          </div>
          <p v-if="login.sessionError" class="micro text-err login__msg">
            状态检查失败: {{ login.sessionError }}
          </p>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <span class="label">用户</span>
          <span class="spacer" />
          <button v-if="login.session?.loggedIn" class="link" @click="login.loadUser()">重新拉取</button>
          <span v-else class="tag">PROFILE</span>
        </div>
        <div class="panel-body">
          <UserCard
            :user="login.user"
            :loading="login.userLoading"
            :error="login.userError"
            :fallback-uin="login.session?.musicid ?? ''"
          />
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
          <div class="qr__box" :class="login.qrBusy ? 'qr__box--busy' : ''">
            <img v-if="login.qrImageUrl" :src="login.qrImageUrl" alt="QQ 登录二维码" />
            <span v-else class="label text-faint">{{ login.qrBusy ? 'LOADING' : 'QR PENDING' }}</span>
          </div>
          <div class="qr__side">
            <div class="qr__state" :class="qrClass">{{ qrHint }}</div>
            <ol class="qr__legend">
              <li><span class="text-faint">SCAN</span> 已扫码，等待确认</li>
              <li><span class="text-faint">CONF</span> 已确认，等待授权</li>
              <li><span class="text-faint">DONE</span> 登录成功</li>
              <li><span class="text-faint">TIMEOUT</span> 二维码过期，需刷新</li>
            </ol>
            <button class="btn" :disabled="login.qrBusy" @click="login.loadQr()">刷新二维码</button>
            <p v-if="login.loggedIn" class="micro text-warn">当前已登录；重新扫码会覆盖现有凭证</p>
            <p v-else class="micro text-faint">每 2s 轮询一次，离开页面自动停止</p>
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
            <button class="btn" :disabled="!login.canSendCode" @click="login.sendCode()">
              {{ login.sendingCode ? '发送中…' : '发送验证码' }}
            </button>
            <span class="micro mono-num text-dim phone__countdown">
              {{ login.countdown > 0 ? `${login.countdown}s` : '' }}
            </span>
          </div>
          <div class="actions">
            <button
              class="btn btn--primary"
              :disabled="login.phoneBusy"
              @click="login.loginByPhone()"
            >
              {{ login.phoneBusy ? '登录中…' : '登录' }}
            </button>
          </div>
          <p v-if="login.phoneMessage" class="micro login__msg" :class="login.phoneMessage.includes('失败') || login.phoneMessage.includes('请输入') ? 'text-err' : 'text-ok'">
            {{ login.phoneMessage }}
          </p>
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

.session__file {
  font-size: var(--fs-label);
  color: var(--text-faint);
  overflow-wrap: anywhere;
}

.actions {
  display: flex;
  gap: var(--sp-2);
  margin-top: var(--sp-3);
}

.login__msg {
  margin: var(--sp-2) 0 0;
  overflow-wrap: anywhere;
}

.link {
  font-size: var(--fs-label);
  letter-spacing: 0.08em;
  color: var(--text-faint);
  cursor: pointer;
}

.link:hover {
  color: var(--blue);
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

.qr__box--busy {
  opacity: 0.6;
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
