import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const MID = '002kR3lm1nTxkV'
const MID_B = 'anotherMid001'

type UrlOption = { okTypes?: readonly string[]; failTypes?: readonly string[] }

/** 用契约形状的假响应驱动解析页，不依赖后端进程。 */
test.beforeEach(async ({ page }) => {
  await page.route('**/health', (route) =>
    route.fulfill({
      json: {
        code: 0,
        message: 'ok',
        data: { status: 'ok', version: '0.0.0-e2e', time: new Date().toISOString(), loggedIn: false, musicid: null },
      },
    }),
  )

  await page.route('**/song/detail**', (route) => {
    const mids = new URL(route.request().url()).searchParams.get('mids') ?? MID
    return route.fulfill({
      json: {
        code: 0,
        message: 'ok',
        data: {
          tracks: [
            {
              id: mids === MID_B ? 102065757 : 102065756,
              mid: mids,
              name: mids === MID_B ? '夜曲 2' : '夜曲',
              singer: [{ name: '周杰伦' }],
              album: { mid: 'albumMidE2E01', name: '十一月的萧邦' },
              interval: 226,
            },
          ],
        },
      },
    })
  })

  await page.route('**/song/urls**', (route) => {
    const type = new URL(route.request().url()).searchParams.get('type') ?? ''
    const ok = type === 'F000' || type === 'M800'
    return route.fulfill({
      json: {
        code: 0,
        message: 'ok',
        data: { [MID]: ok ? { url: `https://example.invalid/${type}` } : { error: `无 ${type}` } },
      },
    })
  })

  await page.route('**/song/lyric**', (route) =>
    route.fulfill({
      json: { code: 0, message: 'ok', data: { lyric: '[00:00.000]第一行', trans: '[00:00.000]translated' } },
    }),
  )

  await page.route('**/song/similar**', (route) =>
    route.fulfill({
      json: {
        code: 0,
        message: 'ok',
        data: {
          list: [
            { id: 2, mid: 'similarMid01', name: '发如雪', singer: [{ name: '周杰伦' }] },
            { id: 3, mid: 'similarMid02', name: '黑色毛衣', singer: [{ name: '周杰伦' }] },
          ],
          groups: [],
        },
      },
    }),
  )

  // APlayer 本地脚本在 e2e 中不需要真实加载
  await page.route('**/vendor/**', (route) => route.fulfill({ body: '', contentType: 'application/javascript' }))
})

/** 真实 paste 事件，验证「粘贴即解析」而不是 fill + Enter */
async function pasteSong(page: Page, text: string): Promise<void> {
  await page.getByPlaceholder(/粘贴歌曲链接/).evaluate((el, value) => {
    const data = new DataTransfer()
    data.setData('text/plain', value)
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    )
  }, text)
}

function midFromUrl(page: Page): string | null {
  return new URL(page.url()).searchParams.get('mid')
}

async function expectParam(page: Page, name: string, value: string | null): Promise<void> {
  await expect.poll(() => new URL(page.url()).searchParams.get(name)).toBe(value)
}

test('粘贴即解析：首屏只探首选档，其他音质展开后才探测', async ({ page }) => {
  const calls: string[] = []
  await page.route('**/song/urls**', (route) => {
    const type = new URL(route.request().url()).searchParams.get('type') ?? ''
    calls.push(type)
    const ok = type === 'F000' || type === 'M800'
    return route.fulfill({
      json: {
        code: 0,
        message: 'ok',
        data: { [MID]: ok ? { url: `https://example.invalid/${type}` } : { error: `无 ${type}` } },
      },
    })
  })

  await page.goto('/')
  await pasteSong(page, `https://y.qq.com/n/ryqq/songDetail/${MID}`)

  await expect(page.locator('.song__title')).toHaveText('夜曲')
  await expect(page.locator('.song__meta').getByText('周杰伦')).toBeVisible()
  await expect(page.getByRole('button', { name: '↓ 下载 SQ 无损' })).toBeEnabled()
  expect(midFromUrl(page)).toBe(MID)
  // 首屏只发 F000 一次；折叠区内容在 DOM 中但不可见
  expect(calls).toEqual(['F000'])
  await expect(page.locator('.qrow').first()).toBeHidden()

  await page.locator('summary').filter({ hasText: '其他音质' }).click()
  await expect(page.locator('.qrow')).toHaveCount(16)
  await expect(page.locator('.qrow--ok')).toHaveCount(1)
  await expect(page.locator('.qrow--err')).toHaveCount(15)
  await expect(page.locator('.panel-head').filter({ hasText: '音质直链' })).toContainText('1 / 16')
  expect(calls).toHaveLength(17)

  // 歌词与相似曲目内联，不需要展开
  await expect(page.locator('.lyric__lines')).toContainText('第一行')
  await expect(page.locator('.similar__row')).toHaveCount(2)
})

test('首选档不可取时主按钮按阶梯降级并写明原因', async ({ page }) => {
  await page.route('**/song/urls**', (route) => {
    const type = new URL(route.request().url()).searchParams.get('type') ?? ''
    const ok = type === 'O800'
    return route.fulfill({
      json: {
        code: 0,
        message: 'ok',
        data: { [MID]: ok ? { url: `https://example.invalid/${type}` } : { error: `无 ${type}` } },
      },
    })
  })

  await page.goto('/')
  await page.getByPlaceholder(/粘贴歌曲链接/).fill(MID)
  await page.getByRole('button', { name: '解析' }).click()

  await expect(page.getByRole('button', { name: '↓ 下载 OGG 320' })).toBeEnabled()
  await expect(page.locator('.primary__hint')).toContainText('「SQ 无损」不可取，已切到「OGG 320」')
})

test('首选音质选择器写入 localStorage，切换期间不闪错误态', async ({ page }) => {
  await page.route('**/song/urls**', async (route) => {
    const type = new URL(route.request().url()).searchParams.get('type') ?? ''
    if (type === 'M500') await new Promise((resolve) => setTimeout(resolve, 300))
    const ok = type === 'F000' || type === 'M800' || type === 'M500'
    return route.fulfill({
      json: {
        code: 0,
        message: 'ok',
        data: { [MID]: ok ? { url: `https://example.invalid/${type}` } : { error: `无 ${type}` } },
      },
    })
  })

  await page.goto('/')
  await page.getByPlaceholder(/粘贴歌曲链接/).fill(MID)
  await page.getByRole('button', { name: '解析' }).click()
  await expect(page.getByRole('button', { name: '↓ 下载 SQ 无损' })).toBeEnabled()

  const select = page.locator('.primary__pref select')
  await select.selectOption('M500')

  // 探测窗口内必须是 pending 文案，不能出现「首选音质不可用」
  await expect(page.getByRole('button', { name: '探测首选音质…' })).toBeDisabled()
  await expect(page.locator('.primary__hint')).not.toContainText('不可用')
  await expect(page.getByRole('button', { name: '↓ 下载 MP3 128' })).toBeEnabled()
  await expect(page.locator('.primary__hint')).not.toContainText('不可用')

  expect(
    await page.evaluate(() => localStorage.getItem('qqm.v1.preferredQuality')),
  ).toBe('M500')
})

test('下载点击一次才落盘，下载条显示成功', async ({ page }) => {
  await page.route('**/song/download**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250))
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'application/octet-stream',
        'content-disposition': "attachment; filename*=UTF-8''%E5%A4%9C%E6%9B%B2.flac",
        'content-length': '9',
      },
      body: 'fake-data',
    })
  })

  await page.goto('/')
  await page.getByPlaceholder(/粘贴歌曲链接/).fill(MID)
  await page.getByRole('button', { name: '解析' }).click()

  const downloadEvent = page.waitForEvent('download')
  const button = page.getByRole('button', { name: '↓ 下载 SQ 无损' })
  await button.click()
  await expect(page.getByRole('button', { name: '正在下载…' })).toBeDisabled()

  const download = await downloadEvent
  expect(download.suggestedFilename()).toBe('夜曲.flac')

  await expect(page.locator('.dlbar')).toBeVisible()
  await expect(page.locator('.dl--done')).toContainText('已保存')
  await expect(page.locator('.dl--done')).toContainText('夜曲.flac')
  expect(midFromUrl(page)).toBe(MID)

  await button.scrollIntoViewIfNeeded()
  await expect(button).toBeEnabled()
})

test('下载失败显示在下载条，重试后可恢复', async ({ page }) => {
  let calls = 0
  await page.route('**/song/download**', (route) => {
    calls += 1
    if (calls === 1) {
      return route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ code: 403, message: '无版权，无法下载' }),
      })
    }
    return route.fulfill({
      status: 200,
      headers: {
        'content-type': 'application/octet-stream',
        'content-disposition': "attachment; filename*=UTF-8''%E5%A4%9C%E6%9B%B2.flac",
      },
      body: 'fake-data',
    })
  })

  await page.goto('/')
  await page.getByPlaceholder(/粘贴歌曲链接/).fill(MID)
  await page.getByRole('button', { name: '解析' }).click()
  await page.getByRole('button', { name: '↓ 下载 SQ 无损' }).click()

  await expect(page.locator('.dl--error')).toContainText('无版权，无法下载')
  await page.locator('.dl--error').getByRole('button', { name: '重试' }).click()
  await expect(page.locator('.dl--done')).toContainText('夜曲.flac')
})

test('歌词下载取当前 tab，切翻译轨后文件名带后缀', async ({ page }) => {
  await page.route('**/song/lyric**', (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('download') !== '1') {
      return route.fulfill({
        json: {
          code: 0,
          message: 'ok',
          data: { lyric: '[00:00.000]第一行', trans: '[00:00.000]translated' },
        },
      })
    }
    const name =
      url.searchParams.get('kind') === 'trans'
        ? '夜曲 - 周杰伦 (翻译).lrc'
        : '夜曲 - 周杰伦.lrc'
    return route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      },
      body: '[00:00.000]第一行\n',
    })
  })

  await page.goto('/')
  await page.getByPlaceholder(/粘贴歌曲链接/).fill(MID)
  await page.getByRole('button', { name: '解析' }).click()
  await expect(page.locator('.lyric__lines')).toContainText('第一行')

  const save = page.getByRole('button', { name: '下载 .lrc' })
  await expect(save).toBeEnabled()

  const first = page.waitForEvent('download')
  await save.click()
  expect((await first).suggestedFilename()).toBe('夜曲 - 周杰伦.lrc')
  await expect(page.locator('.notice--ok')).toContainText('歌词已下载')

  await page.getByRole('button', { name: '翻译' }).click()
  const second = page.waitForEvent('download')
  await save.click()
  expect((await second).suggestedFilename()).toBe('夜曲 - 周杰伦 (翻译).lrc')
})

test('没有歌词那一轨时下载按钮禁用，不报错误', async ({ page }) => {
  await page.route('**/song/lyric**', (route) =>
    route.fulfill({ json: { code: 0, message: 'ok', data: {} } }),
  )

  await page.goto('/')
  await page.getByPlaceholder(/粘贴歌曲链接/).fill(MID)
  await page.getByRole('button', { name: '解析' }).click()
  await expect(page.locator('.lyric__box')).toContainText('尚无歌词')
  await expect(page.getByRole('button', { name: '下载 .lrc' })).toBeDisabled()
})

function searchItems(keyword: string | null, page = 1, total = 2) {
  return {
    keyword: keyword ?? '',
    page,
    num: 20,
    total,
    items: [
      { mid: MID, id: 1, name: '晴天', singer: '周杰伦', album: '叶惠美', albumMid: 'a', interval: 269 },
      { mid: MID_B, id: 2, name: '夜曲', singer: '周杰伦', album: '十一月的萧邦', albumMid: 'b', interval: 226 },
    ],
  }
}

test('关键词搜索出结果列表，点一条即解析那一首', async ({ page }) => {
  await page.route('**/search/song**', (route) =>
    route.fulfill({
      json: {
        code: 0,
        message: 'ok',
        data: searchItems(new URL(route.request().url()).searchParams.get('keyword')),
      },
    }),
  )

  await page.goto('/')
  await page.getByPlaceholder(/关键词搜歌/).fill('周杰伦')
  const go = page.getByRole('button', { name: '搜索' })
  await expect(go).toBeEnabled()
  await go.click()

  await expect(page.locator('.search__row')).toHaveCount(2)
  await expect(page.locator('.search__row').first()).toContainText('晴天')
  expect(new URL(page.url()).searchParams.get('q')).toBe('周杰伦')

  await page.locator('.search__row').nth(1).click()
  await expect(page.locator('.song__title')).toHaveText('夜曲 2')
  await expect.poll(() => midFromUrl(page)).toBe(MID_B)
  // 结果列表留在原地，用户可以接着挑
  await expect(page.locator('.search__row')).toHaveCount(2)
})

test('mid 与关键词互不混淆：输入 mid 时按钮仍是解析', async ({ page }) => {
  await page.goto('/')
  const input = page.getByPlaceholder(/关键词搜歌/)
  await input.fill(MID)
  await expect(page.getByRole('button', { name: '解析' })).toBeEnabled()
  await input.fill('周杰伦 晴天')
  await expect(page.getByRole('button', { name: '搜索' })).toBeEnabled()
})

test('?q= 深链自动搜索，翻页带上 page 且行号接着排', async ({ page }) => {
  const seen: string[] = []
  await page.route('**/search/song**', (route) => {
    const url = new URL(route.request().url())
    const page1 = Number(url.searchParams.get('page') ?? '1')
    seen.push(`${url.searchParams.get('keyword')}@${page1}`)
    return route.fulfill({
      json: { code: 0, message: 'ok', data: searchItems(url.searchParams.get('keyword'), page1, 45) },
    })
  })

  await page.goto('/?q=晴天')
  await expect(page.locator('.search__row')).toHaveCount(2)
  await expect(page.locator('.search__idx').first()).toHaveText('01')

  await page.getByRole('button', { name: '下一页 →' }).click()
  await expect.poll(() => seen).toEqual(['晴天@1', '晴天@2'])
  await expect(page.locator('.search__idx').first()).toHaveText('21')
  await expect(page.locator('.search__pager')).toContainText('2 / 3')
})

test('搜索失败就地显示原因，不占通知条', async ({ page }) => {
  await page.route('**/search/song**', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ code: 500, message: '上游搜索超时' }),
    }),
  )

  await page.goto('/')
  await page.getByPlaceholder(/关键词搜歌/).fill('周杰伦')
  await page.getByRole('button', { name: '搜索' }).click()

  await expect(page.locator('.search__list')).toContainText('上游搜索超时')
  await expect(page.locator('.notices')).not.toContainText('上游搜索超时')
})

test('深链自动解析，前进后退同步曲目', async ({ page }) => {
  await page.goto(`/?mid=${MID}`)
  await expect(page.locator('.song__title')).toHaveText('夜曲')

  await page.getByPlaceholder(/粘贴歌曲链接/).fill(MID_B)
  await page.getByRole('button', { name: '解析' }).click()
  await expect(page.locator('.song__title')).toHaveText('夜曲 2')
  await expect.poll(() => midFromUrl(page)).toBe(MID_B)

  await page.goBack()
  await expect(page.locator('.song__title')).toHaveText('夜曲')
  expect(midFromUrl(page)).toBe(MID)
})

test('认不出 mid 的输入当关键词搜索，不打歌曲接口也不报错', async ({ page }) => {
  let songCalled = false
  await page.route('**/song/**', (route) => {
    songCalled = true
    return route.abort()
  })
  const seen: string[] = []
  await page.route('**/search/song**', (route) => {
    seen.push(new URL(route.request().url()).searchParams.get('keyword') ?? '')
    return route.fulfill({ json: { code: 0, message: 'ok', data: searchItems('not-a-mid') } })
  })

  await page.goto('/')
  await page.getByPlaceholder(/关键词搜歌/).fill('not-a-mid')
  await page.getByRole('button', { name: '搜索' }).click()

  await expect(page.locator('.search__row')).toHaveCount(2)
  expect(seen).toEqual(['not-a-mid'])
  expect(songCalled).toBe(false)
})

const ALBUM_MID = 'albumMidE2E01'

async function mockCollectionRoutes(page: Page): Promise<void> {
  await page.route('**/search/album**', (route) =>
    route.fulfill({
      json: {
        code: 0,
        message: 'ok',
        data: {
          keyword: '晴天',
          page: 1,
          num: 20,
          total: 1,
          items: [
            {
              mid: ALBUM_MID,
              id: 8220,
              name: '叶惠美',
              singer: '周杰伦',
              songNum: 11,
              publishDate: '2003-07-31',
            },
          ],
        },
      },
    }),
  )
  await page.route('**/search/songlist**', (route) =>
    route.fulfill({
      json: {
        code: 0,
        message: 'ok',
        data: {
          keyword: '晴天',
          page: 1,
          num: 20,
          total: 1,
          items: [
            {
              id: '8231976688',
              name: '杰伦精选',
              creator: '某用户',
              songNum: 50,
              listenNum: 12000,
              listenNumText: '1.2万',
              cover: '',
            },
          ],
        },
      },
    }),
  )
  await page.route('**/album/detail**', (route) => {
    const albumMid = new URL(route.request().url()).searchParams.get('mid')
    return route.fulfill({
      json: {
        code: 0,
        message: 'ok',
        data: {
          mid: albumMid,
          name: '叶惠美',
          singer: '周杰伦',
          publishDate: '2003-07-31',
          desc: '',
          total: 1,
          page: 1,
          num: 50,
          hasMore: false,
          items: [
            {
              mid: MID,
              id: 102065756,
              name: '夜曲',
              singer: '周杰伦',
              album: '十一月的萧邦',
              albumMid: 'albumMidE2E02',
              interval: 226,
            },
          ],
        },
      },
    })
  })
  await page.route('**/songlist/detail**', (route) => {
    const seen = new URL(route.request().url()).searchParams
    const pageNo = Number(seen.get('page') ?? '1')
    return route.fulfill({
      json: {
        code: 0,
        message: 'ok',
        data: {
          id: seen.get('dissid'),
          name: '杰伦精选',
          creator: '某用户',
          cover: '',
          desc: '',
          total: 2,
          page: pageNo,
          num: 30,
          hasMore: pageNo === 1,
          items: [
            {
              mid: pageNo === 1 ? MID : MID_B,
              id: pageNo === 1 ? 102065756 : 102065757,
              name: pageNo === 1 ? '夜曲' : '夜曲 2',
              singer: '周杰伦',
              album: '十一月的萧邦',
              albumMid: 'albumMidE2E02',
              interval: 226,
            },
          ],
        },
      },
    })
  })
}

test('专辑页签：点专辑行展开曲目，点曲目回到解析链', async ({ page }) => {
  await mockCollectionRoutes(page)

  await page.goto('/')
  await page.getByPlaceholder(/关键词搜歌/).fill('晴天')
  await page.getByRole('button', { name: '搜索' }).click()
  await page.getByRole('tab', { name: '专辑' }).click()

  await expect(page.locator('.search__row--album')).toHaveCount(1)
  await expect(page.locator('.search__row--album')).toContainText('叶惠美')
  await expectParam(page, 'type', 'album')

  await page.locator('.search__row--album').click()
  await expect(page.locator('.collection__name')).toHaveText('叶惠美')
  await expect(page.locator('.collection__row')).toHaveCount(1)
  await expectParam(page, 'album', ALBUM_MID)
  // 搜索卡留在原地，URL 里也没有 mid
  await expect(page.locator('.search__row--album')).toHaveCount(1)
  expect(midFromUrl(page)).toBeNull()

  await page.locator('.collection__row').click()
  await expect(page.locator('.song__title')).toHaveText('夜曲')
  await expect.poll(() => midFromUrl(page)).toBe(MID)
  expect(new URL(page.url()).searchParams.get('album')).toBe(ALBUM_MID)
})

test('歌单页签：加载更多追加曲目', async ({ page }) => {
  await mockCollectionRoutes(page)

  await page.goto('/?q=晴天&type=songlist')
  await expect(page.locator('.search__row--songlist')).toHaveCount(1)
  await page.locator('.search__row--songlist').click()

  await expect(page.locator('.collection__row')).toHaveCount(1)
  await expectParam(page, 'dissid', '8231976688')

  await page.getByRole('button', { name: '加载更多' }).click()
  await expect(page.locator('.collection__row')).toHaveCount(2)
  await expect(page.locator('.collection__row').nth(1)).toContainText('夜曲 2')
  await expect(page.getByRole('button', { name: '加载更多' })).toHaveCount(0)
})

test('?type= 深链落到对应页签，关掉搜索卡也收起合集', async ({ page }) => {
  await mockCollectionRoutes(page)

  await page.goto(`/?q=晴天&type=album&album=${ALBUM_MID}`)
  await expect(page.getByRole('tab', { name: '专辑' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.collection__name')).toHaveText('叶惠美')

  await page.getByRole('button', { name: '关闭搜索结果' }).click()
  await expect(page.locator('.search')).toHaveCount(0)
  await expect(page.locator('.collection')).toHaveCount(0)
  await expectParam(page, 'q', null)
  await expectParam(page, 'album', null)
})

test('关闭合集卡只收卡片，搜索卡与 URL 关键词留着', async ({ page }) => {
  await mockCollectionRoutes(page)

  await page.goto(`/?q=晴天&type=album&album=${ALBUM_MID}`)
  await expect(page.locator('.collection__name')).toHaveText('叶惠美')
  await page.getByRole('button', { name: '关闭合集' }).click()

  await expect(page.locator('.collection')).toHaveCount(0)
  await expect(page.locator('.search')).toBeVisible()
  await expectParam(page, 'q', '晴天')
  await expectParam(page, 'album', null)
})

/** 4 秒静音 WAV：让真 APlayer 有足够时间停留在 playing 态，不依赖后端 */
const SILENT_WAV = readFileSync(new URL('./fixtures/silence.wav', import.meta.url))

test('解析成功即装载播放器但不发声，点播放才起播', async ({ page }) => {
  // 本地 vendor 真加载：绕过 beforeEach 的空桩，读真实 APlayer 产物
  const vendor = readFileSync(new URL('../../src/public/vendor/APlayer.min.js', import.meta.url), 'utf8')
  await page.route('**/vendor/APlayer.min.js', (route) =>
    route.fulfill({ body: vendor, contentType: 'application/javascript' }),
  )

  await page.route('**/song/urls**', (route) => {
    const type = new URL(route.request().url()).searchParams.get('type') ?? ''
    const ok = type === 'F000' || type === 'M800'
    return route.fulfill({
      json: {
        code: 0,
        message: 'ok',
        data: { [MID]: ok ? { url: 'https://example.invalid/silence.wav' } : { error: `无 ${type}` } },
      },
    })
  })
  await page.route('**/silence.wav', (route) =>
    route.fulfill({ body: SILENT_WAV, contentType: 'audio/wav' }),
  )

  await page.goto('/')
  await page.getByPlaceholder(/粘贴歌曲链接/).fill(MID)
  await page.getByRole('button', { name: '解析' }).click()

  // 装载：标题已是这首歌，但按钮仍是「播放」态（未发声）
  await expect(page.locator('.aplayer-title')).toHaveText(`夜曲 [SQ 无损]`)
  await expect(page.locator('.aplayer-button.aplayer-play')).toBeVisible()
  await expect(page.locator('.aplayer-button.aplayer-pause')).toHaveCount(0)
  await expect(page.locator('.player .panel-head')).toContainText('待播 SQ 无损')

  // 展开其他音质，点行内播放才真正起播（▶ 只给显式点击）
  await page.locator('summary').filter({ hasText: '其他音质' }).click()
  const row = page.locator('.qrow').filter({ hasText: 'MP3 320' })
  await expect(row).toHaveClass(/qrow--ok/)
  await row.getByRole('button', { name: '播放' }).click()

  await expect(page.locator('.aplayer-button.aplayer-pause')).toBeVisible()
  await expect(row.getByRole('button', { name: '正在播放' })).toBeVisible()
  await expect(page.locator('.player .panel-head')).toContainText('▶ MP3 320')

  // 暂停后不能继续写「待播/正在播放」
  await page.locator('.aplayer-button.aplayer-pause').click()
  await expect(page.locator('.player .panel-head')).toContainText('已暂停')

  // 用播放器自带按钮续播：沿用档位文案，不出现「待播」
  await page.locator('.aplayer-button.aplayer-play').click()
  await expect(page.locator('.player .panel-head')).toContainText('MP3 320')
  await expect(page.locator('.player .panel-head')).not.toContainText('待播')
})

test('hires 档位探测成功也不给播放键，只留下载', async ({ page }) => {
  await page.route('**/song/urls**', (route) => {
    const type = new URL(route.request().url()).searchParams.get('type') ?? ''
    const ok = type === 'F000' || type === 'TL01'
    return route.fulfill({
      json: {
        code: 0,
        message: 'ok',
        data: {
          [MID]: ok
            ? { url: type === 'TL01' ? 'https://example.invalid/song.nac' : `https://example.invalid/${type}.flac` }
            : { error: `无 ${type}` },
        },
      },
    })
  })

  await page.goto('/')
  await page.getByPlaceholder(/粘贴歌曲链接/).fill(MID)
  await page.getByRole('button', { name: '解析' }).click()
  await page.locator('summary').filter({ hasText: '其他音质' }).click()

  const nac = page.locator('.qrow').filter({ hasText: 'AICodec' })
  await expect(nac).toHaveClass(/qrow--ok/)
  await expect(nac.getByRole('button', { name: '播放' })).toHaveCount(0)
  await expect(nac.getByText('仅下载')).toBeVisible()
  await expect(nac.getByRole('button', { name: '下载' })).toBeEnabled()
})
