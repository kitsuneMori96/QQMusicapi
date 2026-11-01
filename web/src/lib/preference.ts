import { DEFAULT_PREFERRED_CODE, qualityOf } from './qualities'

/** key 带版本号，字段形态演进时不会读到旧值 */
export const PREFERRED_QUALITY_KEY = 'qqm.v1.preferredQuality'

// 隐私模式或禁用站点存储时 localStorage 会直接抛异常，此时退化为内存值：
// 本次会话内仍然记住，刷新后回到缺省档。
let memoryValue: string | null = null

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function isPreferenceStorageAvailable(): boolean {
  const current = store()
  if (!current) return false
  const probe = `${PREFERRED_QUALITY_KEY}.probe`
  try {
    current.setItem(probe, '1')
    current.removeItem(probe)
    return true
  } catch {
    return false
  }
}

/** 读首选音质：只接受目录里存在的档位，否则退回缺省 SQ 无损 */
export function loadPreferredQuality(): string {
  let raw = ''
  try {
    raw = store()?.getItem(PREFERRED_QUALITY_KEY) ?? ''
  } catch {
    raw = ''
  }
  if (raw && qualityOf(raw)) return raw
  if (memoryValue && qualityOf(memoryValue)) return memoryValue
  return DEFAULT_PREFERRED_CODE
}

/** 写首选音质：未知档位一律忽略，存储异常不抛出 */
export function savePreferredQuality(code: string): void {
  if (!qualityOf(code)) return
  memoryValue = code
  try {
    store()?.setItem(PREFERRED_QUALITY_KEY, code)
  } catch {
    // 存不下也没关系，内存值已生效
  }
}
