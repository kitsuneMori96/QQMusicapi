import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { setAuthErrorHandler } from './api/http'
import { useNoticeStore } from './stores/notice'
import { useStatusStore } from './stores/status'
import './styles/tokens.css'
import './styles/terminal.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)

// 旧原生页「点了没反应」的教训：任何未捕获异常都要在界面上可见。
const notices = useNoticeStore()
window.addEventListener('error', (event) => {
  notices.error('页面错误', event.message || '未知异常')
})
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason as unknown
  notices.error('异步异常', reason instanceof Error ? reason.message : String(reason))
})

// 会话失效：批量请求同时 401 时只保留一条提示，并提供去登录入口
setAuthErrorHandler((message) => {
  void useStatusStore().refresh()
  if (window.location.pathname.startsWith('/login')) return
  notices.error('登录状态已失效', message || '请重新扫码登录', {
    key: 'auth-expired',
    action: { label: '去登录', to: '/login' },
  })
})

app.mount('#app')
