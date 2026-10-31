import { request } from './http'
import type { HealthData } from './contracts'

/** 服务健康检查（解析终端顶栏与状态栏共用） */
export function getHealth(): Promise<HealthData> {
  return request<HealthData>('/health', { timeoutMs: 5000 })
}
