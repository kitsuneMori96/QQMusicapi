import { fileURLToPath, URL } from 'node:url'
import { defineConfig, searchForWorkspaceRoot } from 'vite'
import vue from '@vitejs/plugin-vue'

const API_TARGET = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:3300'

// `/login` 既是 SPA 路由也是后端接口前缀，所以这里只代理 /login 下的具体接口，
// 避免开发态访问 /login 页面时被代理到后端。
const LOGIN_API_PATHS = [
  '/login/status',
  '/login/qrcode',
  '/login/checkQrcode',
  '/login/phone',
  '/login/sendAuthcode',
  '/login/refresh',
  '/login/logout',
]

const proxy = Object.fromEntries([
  ...['/health', '/song', '/search', '/album', '/songlist', '/user', '/vendor'].map((p) => [
    p,
    { target: API_TARGET, changeOrigin: true },
  ]),
  ...LOGIN_API_PATHS.map((p) => [
    p,
    { target: API_TARGET, changeOrigin: true },
  ]),
])

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5273,
    strictPort: true,
    fs: {
      // 允许后续直接引用仓库根部的 src/contracts（TypeBox 契约层）
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        fileURLToPath(new URL('../src/contracts', import.meta.url)),
      ],
    },
    proxy,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
