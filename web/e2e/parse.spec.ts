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

test('非法输入给出可见提示且不请求接口', async ({ page }) => {
  let called = false
  await page.route('**/song/**', (route) => {
    called = true
    return route.abort()
  })

  await page.goto('/')
  await page.getByPlaceholder(/粘贴歌曲链接/).fill('not-a-mid')
  await page.getByRole('button', { name: '解析' }).click()

  await expect(page.getByText('无法识别 songmid')).toBeVisible()
  expect(called).toBe(false)
})

/** 0.1 秒静音 WAV：让真 APlayer 能挂源并进入 playing，不必依赖后端 */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='

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
        data: { [MID]: ok ? { url: SILENT_WAV } : { error: `无 ${type}` } },
      },
    })
  })

  await page.goto('/')
  await page.getByPlaceholder(/粘贴歌曲链接/).fill(MID)
  await page.getByRole('button', { name: '解析' }).click()

  // 装载：标题已是这首歌，但按钮仍是「播放」态（未发声）
  await expect(page.locator('.aplayer-title')).toHaveText(`夜曲 [SQ 无损]`)
  await expect(page.locator('.aplayer-button.aplayer-play')).toBeVisible()
  await expect(page.locator('.aplayer-button.aplayer-pause')).toHaveCount(0)

  // 展开其他音质，点行内播放才真正起播
  await page.locator('summary').filter({ hasText: '其他音质' }).click()
  const row = page.locator('.qrow').filter({ hasText: 'MP3 320' })
  await expect(row).toHaveClass(/qrow--ok/)
  await row.getByRole('button', { name: '播放' }).click()

  await expect(page.locator('.aplayer-button.aplayer-pause')).toBeVisible()
  await expect(row.getByRole('button', { name: '正在播放' })).toBeVisible()
})
