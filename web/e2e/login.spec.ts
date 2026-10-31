import { expect, test, type Page } from '@playwright/test'

const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

interface BackendState {
  loggedIn: boolean
  qrEvents: number[]
}

async function mockBackend(page: Page, state: BackendState) {
  await page.route('**/health', (route) =>
    route.fulfill({
      json: {
        code: 0,
        message: 'ok',
        data: { status: 'ok', version: '0.0.0-e2e', time: new Date().toISOString(), loggedIn: state.loggedIn, musicid: state.loggedIn ? '10086' : null },
      },
    }),
  )

  await page.route('**/login/status', (route) =>
    route.fulfill({
      json: {
        code: 0,
        message: 'ok',
        data: {
          loggedIn: state.loggedIn,
          expired: false,
          musicid: state.loggedIn ? '10086' : null,
          file: '/data/credential.json',
        },
      },
    }),
  )

  await page.route('**/login/qrcode', (route) =>
    route.fulfill({
      json: {
        code: 0,
        message: 'ok',
        data: { type: 'qq', mime: 'image/png', identifier: 'qr-id-e2e', data: PNG_1PX },
      },
    }),
  )

  await page.route('**/login/checkQrcode', (route) => {
    const event = state.qrEvents.shift() ?? 1
    if (event === 0) state.loggedIn = true
    return route.fulfill({
      json: { code: 0, message: 'ok', data: { event, credential: event === 0 ? { musicid: 10086 } : null } },
    })
  })

  await page.route('**/user/self', (route) =>
    route.fulfill({
      json: {
        code: 0,
        message: 'ok',
        data: {
          data: {
            nick: '测试昵称',
            headpic: 'https://example.invalid/avatar.jpg',
            uin: 10086,
            gender: 1,
            viplevel: 8,
            country: '中国',
            province: '广东',
            city: '深圳',
            fans: 12,
            follows: 3,
          },
        },
      },
    }),
  )

  await page.route('**/login/sendAuthcode', (route) =>
    route.fulfill({ json: { code: 0, message: 'ok', data: { event: 'SEND' } } }),
  )

  await page.route('**/login/phone', (route) => {
    state.loggedIn = true
    return route.fulfill({ json: { code: 0, message: 'ok', data: { musicid: 10086 } } })
  })

  await page.route('**/login/refresh', (route) =>
    route.fulfill({ json: { code: 0, message: 'ok', data: { musicid: 10086 } } }),
  )

  await page.route('**/login/logout', (route) => route.fulfill({ json: { code: 0, message: 'ok', data: { ok: true } } }))
}

test('未登录：二维码加载、2s 轮询到登录成功后刷新会话与用户卡', async ({ page }) => {
  const state: BackendState = { loggedIn: false, qrEvents: [1, 2, 0] }
  await mockBackend(page, state)

  await page.goto('/login')
  await expect(page.locator('.qr__box img')).toBeVisible()
  await expect(page.locator('.qr__state')).toHaveText('请使用 QQ 扫描二维码')

  // 轮询节拍由 2s 定时器驱动：SCAN → CONF → DONE
  await expect(page.locator('.qr__state')).toHaveText('已扫码，请在手机上确认', { timeout: 6000 })
  await expect(page.locator('.qr__state')).toHaveText('已确认，正在授权…', { timeout: 6000 })
  await expect(page.locator('.qr__state')).toHaveText('登录成功', { timeout: 6000 })

  await expect(page.locator('.ucard__name')).toHaveText('测试昵称')
  await expect(page.locator('.ucard__tags')).toContainText('VIP 8')
  await expect(page.locator('.session')).toContainText('10086')
  await expect(page.getByRole('button', { name: '刷新凭证' })).toBeEnabled()
})

test('已登录：直接展示会话、用户卡与原始 JSON', async ({ page }) => {
  await mockBackend(page, { loggedIn: true, qrEvents: [] })

  await page.goto('/login')
  await expect(page.locator('.ucard__name')).toHaveText('测试昵称')
  await expect(page.locator('.ucard__meta')).toContainText('中国 / 广东 / 深圳')

  await page.getByRole('button', { name: '▶ 查看原始 JSON' }).click()
  await expect(page.locator('.ucard__raw')).toContainText('测试昵称')
})

test('手机验证码：发送后倒计时并登录成功', async ({ page }) => {
  const state: BackendState = { loggedIn: false, qrEvents: [] }
  await mockBackend(page, state)

  await page.goto('/login')
  await page.getByRole('button', { name: '手机验证码' }).click()

  await page.getByPlaceholder('11 位手机号').fill('13800138000')
  await page.getByRole('button', { name: '发送验证码' }).click()
  await expect(page.getByText('验证码已发送，请查收短信')).toBeVisible()
  await expect(page.locator('.phone__countdown')).toContainText('s')
  await expect(page.getByRole('button', { name: '发送验证码' })).toBeDisabled()

  await page.getByPlaceholder('6 位验证码').fill('123456')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.locator('.ucard__name')).toHaveText('测试昵称')
})
