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

  await page.locator('summary').filter({ hasText: '歌词与相似曲目' }).click()
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

test('首选音质选择器写入 localStorage 并立即切换主按钮', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder(/粘贴歌曲链接/).fill(MID)
  await page.getByRole('button', { name: '解析' }).click()
  await expect(page.getByRole('button', { name: '↓ 下载 SQ 无损' })).toBeEnabled()

  await page.locator('.primary__pref select').selectOption('M800')
  await expect(page.getByRole('button', { name: '↓ 下载 MP3 320' })).toBeEnabled()
  expect(
    await page.evaluate(() => localStorage.getItem('qqm.v1.preferredQuality')),
  ).toBe('M800')
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
