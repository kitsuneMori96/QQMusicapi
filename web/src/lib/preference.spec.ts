import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PREFERRED_CODE } from './qualities'
import { PREFERRED_QUALITY_KEY } from './preference'

// 模块内有内存兜底值，每个用例重新加载模块以隔离
async function freshModule(): Promise<typeof import('./preference')> {
  vi.resetModules()
  return import('./preference')
}

describe('首选音质持久化', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('没有存过值时退回缺省档', async () => {
    const pref = await freshModule()
    expect(pref.loadPreferredQuality()).toBe(DEFAULT_PREFERRED_CODE)
    expect(DEFAULT_PREFERRED_CODE).toBe('F000')
  })

  it('save 后 load 读回同一档位，并写进带版本号的 key', async () => {
    const pref = await freshModule()
    pref.savePreferredQuality('M800')
    expect(pref.loadPreferredQuality()).toBe('M800')
    expect(localStorage.getItem(PREFERRED_QUALITY_KEY)).toBe('M800')
  })

  it('存了目录里不存在的档位时退回缺省', async () => {
    localStorage.setItem(PREFERRED_QUALITY_KEY, 'ZZZZ')
    const pref = await freshModule()
    expect(pref.loadPreferredQuality()).toBe(DEFAULT_PREFERRED_CODE)
  })

  it('未知档位不写入存储', async () => {
    const pref = await freshModule()
    pref.savePreferredQuality('ZZZZ')
    expect(localStorage.getItem(PREFERRED_QUALITY_KEY)).toBeNull()
    expect(pref.loadPreferredQuality()).toBe(DEFAULT_PREFERRED_CODE)
  })

  it('存储可用时 isPreferenceStorageAvailable 为真', async () => {
    const pref = await freshModule()
    expect(pref.isPreferenceStorageAvailable()).toBe(true)
  })

  it('localStorage 抛异常：不抛出、检测为不可用，但本次会话仍然记住', async () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('SecurityError')
      },
      setItem() {
        throw new Error('SecurityError')
      },
      removeItem() {
        throw new Error('SecurityError')
      },
    })
    const pref = await freshModule()
    expect(pref.isPreferenceStorageAvailable()).toBe(false)
    expect(pref.loadPreferredQuality()).toBe(DEFAULT_PREFERRED_CODE)
    expect(() => pref.savePreferredQuality('O801')).not.toThrow()
    expect(pref.loadPreferredQuality()).toBe('O801')
  })

  it('完全没有 localStorage 的环境里仍可用', async () => {
    vi.stubGlobal('localStorage', undefined)
    const pref = await freshModule()
    expect(pref.isPreferenceStorageAvailable()).toBe(false)
    pref.savePreferredQuality('C600')
    expect(pref.loadPreferredQuality()).toBe('C600')
  })
})
