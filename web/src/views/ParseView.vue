<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SongHeader from '@/components/SongHeader.vue'
import QualityGrid from '@/components/QualityGrid.vue'
import LyricPanel from '@/components/LyricPanel.vue'
import SimilarList from '@/components/SimilarList.vue'
import PlayerBar from '@/components/PlayerBar.vue'
import { useParseStore } from '@/stores/parse'
import { usePlayerStore } from '@/stores/player'
import { QUALITY_TOTAL, type Quality } from '@/lib/qualities'
import { coverUrl, extractMid } from '@/lib/mid'

const parse = useParseStore()
const player = usePlayerStore()
const route = useRoute()
const router = useRouter()

const pending = computed(() => parse.phase === 'parsing')

function queryMid(): string {
  return extractMid(String(route.query.mid ?? ''))
}

/**
 * 统一入口：解析成功后把 mid 写入 URL（push，保留历史），失败不写。
 * 由 URL（挂载/前进后退）触发时 URL 已经是目标值，不会重复写入。
 */
async function runParse(mid?: string): Promise<void> {
  if (mid) parse.input = mid
  const ok = await parse.parse()
  if (!ok || !parse.mid || queryMid() === parse.mid) return
  void router.push({ query: { ...route.query, mid: parse.mid } })
}

function submit(): void {
  void runParse()
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
  const mid = queryMid()
  if (!mid) return
  parse.input = mid
  void runParse(mid)
})

function play(quality: Quality): void {
  const info = parse.urlOf(quality.code)
  if (!info?.url) return
  const track = parse.track
  const artist =
    (track?.singer ?? [])
      .map((s) => s.name ?? '')
      .filter(Boolean)
      .join(' / ') || '—'
  player.play({
    name: track?.name || parse.mid,
    artist,
    url: info.url,
    cover: coverUrl(track?.album?.mid),
    qualityLabel: quality.label,
    qualityCode: quality.code,
  })
}

function download(quality: Quality): void {
  void parse.download(quality.code)
}

function retry(quality: Quality): void {
  void parse.retryQuality(quality.code)
}

function retryFailed(): void {
  void parse.retryFailed()
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
          v-model="parse.input"
          class="input"
          type="text"
          spellcheck="false"
          autocomplete="off"
          placeholder="粘贴歌曲链接 / songmid= / 直接输入 mid"
          @keydown.enter="submit"
        />
        <button class="btn btn--primary" :disabled="pending" @click="submit">
          {{ pending ? '解析中…' : '解析' }}
        </button>
      </div>
      <div class="query__meta">
        <span class="micro text-faint">识别 mid: {{ extractMid(parse.input) || '—' }}</span>
        <span class="micro text-faint">{{ QUALITY_TOTAL }} 种音质</span>
        <span v-if="parse.phase === 'error'" class="micro text-err">{{ parse.detailError }}</span>
        <span class="spacer" />
      </div>
    </section>

    <div class="grid-2 parse__grid">
      <div class="parse__col">
        <SongHeader
          v-if="parse.mid"
          :track="parse.track"
          :mid="parse.mid"
          :detail-error="parse.detailError"
        />
        <section v-else class="panel intro">
          <div class="panel-head">
            <span class="label">待机</span>
            <span class="spacer" />
            <span class="tag">NO TARGET</span>
          </div>
          <div class="panel-body">
            <p class="intro__line"><span class="text-blue">01</span> 输入 songDetail 链接，自动提取 songmid</p>
            <p class="intro__line"><span class="text-blue">02</span> 逐音质探测直链，结果按 17 轨列出</p>
            <p class="intro__line"><span class="text-blue">03</span> 歌词 / 相似曲目并行拉取，失败不阻断</p>
          </div>
        </section>

        <PlayerBar />

        <QualityGrid
          :states="parse.qualities"
          :resolved="parse.resolved"
          :downloading="parse.downloading"
          @play="play"
          @download="download"
          @retry="retry"
          @retry-failed="retryFailed"
        />
      </div>

      <div class="parse__col">
        <LyricPanel :lyric="parse.lyric" :loading="parse.lyricLoading" />
        <SimilarList :items="parse.similar" :loading="parse.similarLoading" @select="selectSimilar" />
      </div>
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
