<script setup lang="ts">
import { computed, ref } from 'vue'
import { deriveProfile } from '@/lib/userProfile'
import type { UserSelfData } from '@/api/contracts'

const props = defineProps<{
  user: UserSelfData | null
  loading?: boolean
  error?: string
  /** /user/self 里没有可靠 uin 时（常见为 0），回落到 /login/status 的 musicid */
  fallbackUin?: string
}>()

const showRaw = ref(false)
const avatarBroken = ref(false)

const profile = computed(() => deriveProfile(props.user))
const displayUin = computed(() => {
  const uin = profile.value.uin
  if (uin && uin !== '0') return uin
  return props.fallbackUin ?? ''
})
const hasWarnings = computed(
  () => Boolean(props.user) && (!profile.value.nickname || !profile.value.avatar),
)
</script>

<template>
  <div class="ucard">
    <div v-if="loading" class="empty">加载中…</div>
    <div v-else-if="error" class="ucard__error">获取用户信息失败: {{ error }}</div>
    <div v-else-if="!user" class="empty">未登录，暂无可展示的用户信息</div>

    <template v-else>
      <div class="ucard__head">
        <div class="ucard__avatar">
          <img
            v-if="profile.avatar && !avatarBroken"
            :src="profile.avatar"
            alt="avatar"
            @error="avatarBroken = true"
          />
          <span v-else class="label text-faint">?</span>
        </div>

        <div class="ucard__main">
          <div class="ucard__name">{{ profile.nickname || '(未知昵称)' }}</div>
          <div class="ucard__tags">
            <span v-if="profile.isVip" class="tag tag--warn">
              VIP{{ profile.vipLevel ? ` ${profile.vipLevel}` : '' }}
            </span>
            <span v-if="displayUin" class="tag tag--blue">QQ {{ displayUin }}</span>
            <span v-if="profile.gender" class="tag">{{ profile.gender }}</span>
          </div>
          <div v-if="hasWarnings" class="ucard__warn">
            ⚠ 未识别到{{ !profile.nickname ? '昵称' : '' }}{{ !profile.nickname && !profile.avatar ? ' / ' : '' }}{{ !profile.avatar ? '头像' : '' }}，展开原始 JSON 核对字段
          </div>
        </div>
      </div>

      <dl v-if="profile.region || profile.age || profile.fans || profile.follows || profile.songs || profile.playlists" class="ucard__meta">
        <div v-if="profile.region" class="kv">
          <dt>地区</dt>
          <dd>{{ profile.region }}</dd>
        </div>
        <div v-if="profile.age" class="kv">
          <dt>年龄</dt>
          <dd class="mono-num">{{ profile.age }}</dd>
        </div>
        <div v-if="profile.fans" class="kv">
          <dt>粉丝</dt>
          <dd class="mono-num">{{ profile.fans }}</dd>
        </div>
        <div v-if="profile.follows" class="kv">
          <dt>关注</dt>
          <dd class="mono-num">{{ profile.follows }}</dd>
        </div>
        <div v-if="profile.songs" class="kv">
          <dt>歌曲</dt>
          <dd class="mono-num">{{ profile.songs }}</dd>
        </div>
        <div v-if="profile.playlists" class="kv">
          <dt>歌单</dt>
          <dd class="mono-num">{{ profile.playlists }}</dd>
        </div>
      </dl>

      <p v-if="profile.intro" class="ucard__intro">“{{ profile.intro }}”</p>

      <button class="ucard__toggle" @click="showRaw = !showRaw">
        {{ showRaw ? '▼ 收起原始 JSON' : '▶ 查看原始 JSON' }}
      </button>
      <pre v-if="showRaw" class="ucard__raw scroll-y">{{ JSON.stringify(user, null, 2) }}</pre>
    </template>
  </div>
</template>

<style scoped>
.ucard {
  min-width: 0;
}

.ucard__head {
  display: flex;
  gap: var(--sp-3);
  align-items: center;
}

.ucard__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  flex: none;
  background: var(--panel-sunken);
  border: var(--hairline);
  border-radius: var(--radius);
  overflow: hidden;
}

.ucard__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ucard__main {
  min-width: 0;
}

.ucard__name {
  font-size: var(--fs-title);
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ucard__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin-top: var(--sp-1);
}

.ucard__warn {
  margin-top: var(--sp-1);
  font-size: var(--fs-label);
  color: var(--warn);
}

.ucard__meta {
  margin: var(--sp-3) 0 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 var(--sp-4);
}

.ucard__intro {
  margin: var(--sp-2) 0 0;
  font-size: var(--fs-micro);
  color: var(--text-dim);
  line-height: 1.6;
}

.ucard__error {
  font-size: var(--fs-micro);
  color: var(--err);
  overflow-wrap: anywhere;
}

.ucard__toggle {
  margin-top: var(--sp-3);
  font-size: var(--fs-label);
  letter-spacing: 0.08em;
  color: var(--text-faint);
  cursor: pointer;
}

.ucard__toggle:hover {
  color: var(--blue);
}

.ucard__raw {
  max-height: 240px;
  margin: var(--sp-2) 0 0;
  padding: var(--sp-2);
  background: var(--panel-sunken);
  border: var(--hairline);
  font-size: var(--fs-label);
  color: var(--text-dim);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
