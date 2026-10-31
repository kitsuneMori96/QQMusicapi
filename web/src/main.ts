import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useNoticeStore } from './stores/notice'
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

app.mount('#app')
