import { expect, test } from '@playwright/test'

const MID = '002kR3lm1nTxkV'

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

  await page.route('**/song/detail**', (route) =>
    route.fulfill({
      json: {
        code: 0,
        message: 'ok',
        data: {
          tracks: [
            {
              id: 102065756,
              mid: MID,
              name: '夜曲',
              singer: [{ name: '周杰伦' }],
              album: { mid: 'albumMidE2E01', name: '十一月的萧邦' },
              interval: 226,
            },
          ],
        },
      },
    }),
  )

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

test('解析后渲染曲目、音质状态、歌词与相似曲目', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder(/粘贴歌曲链接/).fill(`https://y.qq.com/n/ryqq/songDetail/${MID}`)
  await page.getByRole('button', { name: '解析' }).click()

  await expect(page.locator('.song__title')).toHaveText('夜曲')
  await expect(page.locator('.song__meta').getByText('周杰伦')).toBeVisible()

  // 17 档全部探测完成：2 档命中，其余标记失败原因
  await expect(page.locator('.qrow--ok')).toHaveCount(2)
  await expect(page.locator('.qrow--err')).toHaveCount(15)
  await expect(page.locator('.panel-head').filter({ hasText: '音质直链' })).toContainText('2 / 17')

  await expect(page.locator('.lyric__text')).toContainText('第一行')
  await expect(page.locator('.similar__row')).toHaveCount(2)

  // 命中音质的播放/下载按钮可用，失败档位禁用
  await expect(page.locator('.qrow--ok').first().getByRole('button', { name: '下载' })).toBeEnabled()
  await expect(page.locator('.qrow--err').first().getByRole('button', { name: '播放' })).toBeDisabled()
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
