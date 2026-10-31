import { expect, test } from '@playwright/test'

test('解析页外壳与状态栏可见', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('QQMUSIC')).toBeVisible()
  await expect(page.getByRole('link', { name: '解析' })).toBeVisible()
  await expect(page.getByRole('link', { name: '登录' })).toBeVisible()
  await expect(page.locator('footer')).toContainText('服务')
  await expect(page.getByPlaceholder(/粘贴歌曲链接/)).toBeVisible()
})

test('登录页可直接访问并切换登录方式', async ({ page }) => {
  await page.goto('/login')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText('登录方式')).toBeVisible()

  await page.getByRole('button', { name: '手机验证码' }).click()
  await expect(page.getByPlaceholder('11 位手机号')).toBeVisible()
  await expect(page.getByRole('button', { name: '发送验证码' })).toBeVisible()
})

test('未知路由回落到解析页', async ({ page }) => {
  await page.goto('/no-such-page')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByPlaceholder(/粘贴歌曲链接/)).toBeVisible()
})
