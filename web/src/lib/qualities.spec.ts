import { describe, expect, it } from 'vitest'
import { QUALITIES, QUALITY_TOTAL } from './qualities'

describe('QUALITIES', () => {
  it('固定 17 种音质', () => {
    expect(QUALITY_TOTAL).toBe(17)
    expect(QUALITIES).toHaveLength(17)
  })

  it('code 唯一', () => {
    expect(new Set(QUALITIES.map((q) => q.code)).size).toBe(QUALITIES.length)
  })

  it('保留后端约定的顺序与标签', () => {
    expect(QUALITIES[0]).toMatchObject({ code: 'DT03', label: 'DTS:X' })
    expect(QUALITIES[7]).toMatchObject({ code: 'F000', label: 'SQ 无损' })
    expect(QUALITIES.at(-1)).toMatchObject({ code: 'C200', label: 'AAC 48' })
  })
})
