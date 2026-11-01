<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SongHeader from '@/components/SongHeader.vue'
import QualityGrid from '@/components/QualityGrid.vue'
import LyricPanel from '@/components/LyricPanel.vue'
import SimilarList from '@/components/SimilarList.vue'
import PlayerBar from '@/components/PlayerBar.vue'
import { useParseStore } from '@/stores/parse'
import { usePlayerStore } from '@/stores/player'
import { useDownloadsStore } from '@/stores/downloads'
import { useNoticeStore } from '@/stores/notice'
import { QUALITIES, QUALITY_TOTAL, qualityOf, type Quality } from '@/lib/qualities'
import { coverUrl, extractMid, extractShareUrl } from '@/lib/mid'

const parse = useParseStore()
const player = usePlayerStore()
const downloads = useDownloadsStore()
const notice = useNoticeStore()
const route = useRoute()
const router = useRouter()

const searchEl = ref<HTMLInputElement | null>(null)
const resultEl = ref<HTMLElement | null>(null)

const pending = computed(() => parse.phase === 'parsing')
const activeQuality = computed(() =>
  player.current?.mid === parse.mid ? (player.current?.qualityCode ?? '') : '',
)
const seekable = computed(() => Boolean(player.current && player.current.mid === parse.mid))

const primaryQuality = computed(() =>
  parse.primary ? qualityOf(parse.primary.code) : undefined,
)
const primaryInFlight = computed(() => {
  const primary = parse.primary
  if (!parse.mid || !primary) return undefined
  return downloads.active.find((t) => t.mid === parse.mid && t.code === primary.code)
})
const primaryLabel = computed(() => {
  if (pending.value) return '探测首选音质…'
  if (!primaryQuality.value) return '首选音质不可用'
  if (primaryInFlight.value) return '正在下载…'
  return `↓ 下载 ${primaryQuality.value.label}`
})
const fallbackFromLabel = computed(() =>
  parse.fellBackFrom ? (qualityOf(parse.fellBackFrom)?.label ?? parse.fellBackFrom) : '',
)
const fallbackHint = computed(() => {
  if (parse.fellBackFrom) {
    return `「${fallbackFromLabel.value}」不可取，已切到「${primaryQuality.value?.label ?? ''}」`
  }
  if (!parse.primary && !pending.value && parse.mid) {
    return '首选与降级阶梯均不可用，展开「其他音质」重试'
  }
  return ''
})
const preferredModel = computed({
  get: () => parse.preferred,
  set: (code: string) => {
    void parse.setPreferred(code)
  },
})

function queryMid(): string {
  return extractMid(String(route.query.mid ?? ''))
}

/**
 * 统一入口：解析成功后把 mid 写入 URL（push，保留历史），失败不写。
 * 由 URL（挂载/前进后退）触发时 URL 已经是目标值，不会重复写入。
 */
async function runParse(mid?: string): Promise<boolean> {
  if (mid) parse.input = mid
  const ok = await parse.parse()
  if (!ok || !parse.mid || queryMid() === parse.mid) return ok
  void router.push({ query: { ...route.query, mid: parse.mid } })
  return ok
}

/** 解析成功后把焦点移到结果区，读屏和键盘用户不必再从输入框走一遍 */
async function focusResults(): Promise<void> {
  await nextTick()
  resultEl.value?.focus()
}

function submit(): void {
  void runParse().then((ok) => {
    if (ok) void focusResults()
  })
}

/** 粘贴即解析：只接管能识别成 mid / 分享链接的文本，其余粘贴保持原样 */
function onPaste(event: ClipboardEvent): void {
  const text = event.clipboardData?.getData('text') ?? ''
  if (!text.trim()) return
  if (!extractMid(text) && !extractShareUrl(text)) return
  event.preventDefault()
  parse.input = text.trim()
  submit()
}

function onOthersToggle(event: Event): void {
  const details = event.target as HTMLDetailsElement | null
  if (details?.open) void parse.probeOthers()
}

function downloadPrimary(): void {
  const primary = parse.primary
  if (!primary || !parse.mid) return
  downloads.start({
    mid: parse.mid,
    code: primary.code,
    label: parse.track?.name || parse.mid,
  })
}

/** `/` 快速回到搜索框（输入类控件内不拦截） */
function onSlashShortcut(event: KeyboardEvent): void {
  if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
  const target = event.target as HTMLElement | null
  const tag = target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
    return
  }
  event.preventDefault()
  searchEl.value?.focus()
  searchEl.value?.select()
}

watch(
  () => String(route.query.mid ?? ''),
  (value) => {
    const next = extractMid(value)
    if (!next || next === parse.mid) return
    parse.input = next
    void runParse(next)
  },
)

onMounted(() => {
  window.addEventListener('keydown', onSlashShortcut)
  const mid = queryMid()
  if (!mid) return
  parse.input = mid
  void runParse(mid)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onSlashShortcut)
})

// 换歌时停掉旧曲目，避免播放器继续占用已失效的直链
watch(
  () => parse.mid,
  (mid) => {
    if (!mid || !player.current) return
    if (player.current.mid !== mid) player.clear()
  },
)

async function play(quality: Quality): Promise<void> {
  const ready = await parse.ensureProbed(quality.code)
  const info = parse.urlOf(quality.code)
  if (!ready || !info?.url) {
    notice.warn(
      `「${quality.label}」暂不可播放`,
      parse.qualities[quality.code]?.error || '未取到可用直链',
    )
    return
  }
  const track = parse.track
  const artist =
    (track?.singer ?? [])
      .map((s) => s.name ?? '')
      .filter(Boolean)
      .join(' / ') || '—'
  player.play({
    mid: parse.mid,
    name: track?.name || parse.mid,
    artist,
    url: info.url,
    cover: coverUrl(track?.album?.mid),
    qualityLabel: quality.label,
    qualityCode: quality.code,
  })
}

function retry(quality: Quality): void {
  void parse.retryQuality(quality.code)
}

function retryFailed(): void {
  void parse.retryFailed()
}

function seek(seconds: number): void {
  player.seek(seconds)
}

function selectSimilar(mid: string): void {
  parse.input = mid
  void runParse(mid)
}
</script>

<template>
  <div class="parse">
    <section class="panel query">
      <div class="query__row">
        <span class="label query__label">SONG</span>
        <input
          ref="searchEl"
          v-model="parse.input"
          class="input"
          type="text"
          spellcheck="false"
          autocomplete="off"
          placeholder="粘贴歌曲链接 / 分享短链 / songmid= / 直接输入 mid"
          aria-keyshortcuts="/"
          @keydown.enter="submit"
          @paste="onPaste"
        />
        <button class="btn btn--primary" :disabled="pending" @click="submit">
          {{ pending ? '解析中…' : '解析' }}
        </button>
      </div>
      <div class="query__meta">
        <span class="micro text-faint">
          识别 mid:
          {{
            parse.mid ||
            extractMid(parse.input) ||
            (parse.phase === 'parsing' ? '解析分享链接…' : '—')
          }}
        </span>
        <span class="micro text-faint">{{ QUALITY_TOTAL }} 种音质</span>
        <span v-if="parse.phase === 'error'" class="micro text-err">{{ parse.detailError }}</span>
        <span class="spacer" />
      </div>
    </section>

    <div ref="resultEl" class="parse__results" tabindex="-1">
      <template v-if="parse.mid">
        <SongHeader :track="parse.track" :mid="parse.mid" :detail-error="parse.detailError" />

        <section class="panel primary">
          <div class="panel-body primary__body">
            <button
              class="btn btn--primary primary__btn"
              :disabled="pending || !parse.primary || Boolean(primaryInFlight)"
              @click="downloadPrimary"
            >
              {{ primaryLabel }}
            </button>

            <label class="primary__pref">
              <span class="label">首选音质</span>
              <select v-model="preferredModel" class="select">
                <option v-for="q in QUALITIES" :key="q.code" :value="q.code">
                  {{ q.label }} · {{ q.code }}
                </option>
              </select>
            </label>

            <p v-if="fallbackHint" class="primary__hint" :class="{ 'text-err': !parse.primary }">
              {{ fallbackHint }}
            </p>
            <p v-else class="primary__hint text-faint">下载需点击一次，不会自动保存</p>
          </div>
        </section>

        <PlayerBar />

        <details class="fold" @toggle="onOthersToggle">
          <summary class="fold__head">
            <span class="label">其他音质</span>
            <span class="micro text-dim">
              {{ parse.probed ? Object.keys(parse.probed).length : 0 }} / {{ QUALITY_TOTAL }} 已探测
            </span>
            <span class="spacer" />
            <span class="micro text-faint">展开后并发探测，失败可重试</span>
          </summary>
          <QualityGrid
            :states="parse.qualities"
            :exclude-code="parse.primary?.code"
            :active-code="activeQuality"
            :playing="player.playing"
            @play="play"
            @retry="retry"
            @retry-failed="retryFailed"
          />
        </details>

        <details class="fold">
          <summary class="fold__head">
            <span class="label">歌词与相似曲目</span>
            <span class="micro text-dim">折叠区</span>
            <span class="spacer" />
            <span class="micro text-faint">试听可用上方播放器</span>
          </summary>
          <div class="grid-2 parse__grid">
            <LyricPanel
              :lyric="parse.lyric"
              :loading="parse.lyricLoading"
              :current-time="seekable ? player.currentTime : -1"
              :seekable="seekable"
              @seek="seek"
            />
            <SimilarList
              :items="parse.similar"
              :loading="parse.similarLoading"
              :active-mid="parse.mid"
              @select="selectSimilar"
            />
          </div>
        </details>
      </template>

      <section v-else class="panel intro">
        <div class="panel-head">
          <span class="label">待机</span>
          <span class="spacer" />
          <span class="tag">NO TARGET</span>
        </div>
        <div class="panel-body">
          <p class="intro__line"><span class="text-blue">01</span> 粘贴歌曲链接 / 分享短链，立即开始解析</p>
          <p class="intro__line"><span class="text-blue">02</span> 首屏只探测首选音质，其余 16 档按需展开</p>
          <p class="intro__line"><span class="text-blue">03</span> 下载必须点击，绝不自动落盘</p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.parse {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  max-width: 1440px;
  margin: 0 auto;
}

.query {
  padding: var(--sp-2) var(--sp-3);
}

.query__row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.query__label {
  flex: none;
}

.query__meta {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  margin-top: var(--sp-2);
  padding-left: 44px;
}

.parse__grid {
  align-items: start;
}

.parse__results {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}

.parse__results:focus {
  outline: none;
}

.primary__body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-3);
}

.primary__btn {
  min-width: 220px;
  height: 34px;
  font-size: var(--fs-body);
  letter-spacing: 0.04em;
}

.primary__pref {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
}

.select {
  height: 24px;
  padding: 0 var(--sp-2);
  background: var(--panel-sunken);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: var(--fs-micro);
  cursor: pointer;
}

.select:focus {
  outline: none;
  border-color: var(--blue);
}

.primary__hint {
  flex-basis: 100%;
  margin: 0;
  font-size: var(--fs-micro);
}

.fold {
  border: var(--hairline);
  border-radius: var(--radius);
  background: var(--panel);
}

.fold__head {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-height: 30px;
  padding: 0 var(--sp-3);
  cursor: pointer;
  list-style: none;
}

.fold__head::-webkit-details-marker {
  display: none;
}

.fold__head::before {
  content: '▸';
  color: var(--text-faint);
  font-size: var(--fs-label);
}

.fold[open] > .fold__head::before {
  content: '▾';
  color: var(--blue);
}

.fold[open] > .fold__head {
  border-bottom: var(--hairline);
}

.fold > :deep(.panel) {
  border: none;
}

.fold > .parse__grid {
  padding: var(--sp-3);
}

.parse__col {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}

.intro__line {
  margin: 0;
  font-size: var(--fs-micro);
  color: var(--text-dim);
}

.intro__line + .intro__line {
  margin-top: var(--sp-1);
}
</style>
