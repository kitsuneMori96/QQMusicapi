import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PREFERRED_CODE,
  FALLBACK_LADDER,
  QUALITIES,
  QUALITY_TOTAL,
  ladderFrom,
  qualityOf,
  resolvePreferred,
  sortByRank,
} from './qualities'

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

  it('rank 等于目录顺序，ext 与后端枚举一致', () => {
    expect(QUALITIES.map((q) => q.rank)).toEqual(QUALITIES.map((_, i) => i))
    expect(qualityOf('F000')?.ext).toBe('flac')
    expect(qualityOf('DT03')?.ext).toBe('mp4')
    expect(qualityOf('C200')?.ext).toBe('m4a')
    expect(qualityOf('NOPE')).toBeUndefined()
  })
})

describe('ladderFrom', () => {
  it('首选在阶梯上时从该档往后截', () => {
    expect(ladderFrom('F000')).toEqual(FALLBACK_LADDER)
    expect(ladderFrom('O800')).toEqual(['O800', 'M800', 'M500'])
    expect(ladderFrom('M500')).toEqual(['M500'])
  })

  it('阶梯外的档先试它自己再退回阶梯', () => {
    expect(ladderFrom('AI00')).toEqual(['AI00', ...FALLBACK_LADDER])
    expect(ladderFrom('C600')).toEqual(['C600', ...FALLBACK_LADDER])
  })

  it('阶梯本身不含 hires', () => {
    const hires = new Set(QUALITIES.filter((q) => q.group === 'hires').map((q) => q.code))
    expect(FALLBACK_LADDER.some((code) => hires.has(code))).toBe(false)
    expect(DEFAULT_PREFERRED_CODE).toBe('F000')
  })
})

describe('resolvePreferred', () => {
  it('首选可取时不算降级', () => {
    expect(resolvePreferred({ F000: 'ok' }, 'F000')).toEqual({ code: 'F000', fellBackFrom: null })
  })

  it('沿阶梯降级并报告原首选档', () => {
    expect(resolvePreferred({ F000: 'err', O801: 'err', M800: 'ok' }, 'F000')).toEqual({
      code: 'M800',
      fellBackFrom: 'F000',
    })
  })

  it('loading/idle 不算可取', () => {
    expect(resolvePreferred({ F000: 'loading', O801: 'idle' }, 'F000')).toBeNull()
  })

  it('一个都没 ok 时返回 null', () => {
    expect(resolvePreferred({ F000: 'err', O801: 'err', O800: 'err' }, 'F000')).toBeNull()
  })

  it('母带首选可取时不算降级，不可取时退到 SQ', () => {
    expect(resolvePreferred({ AI00: 'ok' }, 'AI00')).toEqual({ code: 'AI00', fellBackFrom: null })
    expect(resolvePreferred({ AI00: 'err', F000: 'ok' }, 'AI00')).toEqual({
      code: 'F000',
      fellBackFrom: 'AI00',
    })
  })

  it('不会自动升级进 hires 组', () => {
    expect(resolvePreferred({ F000: 'err', AI00: 'ok' }, 'F000')).toBeNull()
  })
})

describe('sortByRank', () => {
  it('按保真层级排序且不改原数组', () => {
    const input = [{ code: 'M800' }, { code: 'AI00' }, { code: 'F000' }]
    expect(sortByRank(input).map((q) => q.code)).toEqual(['AI00', 'F000', 'M800'])
    expect(input.map((q) => q.code)).toEqual(['M800', 'AI00', 'F000'])
  })

  it('未知 code 排到最后', () => {
    expect(sortByRank([{ code: 'X' }, { code: 'C200' }]).map((q) => q.code)).toEqual(['C200', 'X'])
  })
})
