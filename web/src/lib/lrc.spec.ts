import { describe, expect, it } from 'vitest'
import { findActiveIndex, parseLrc } from './lrc'

describe('parseLrc', () => {
  it('解析时间戳并忽略元信息', () => {
    const lines = parseLrc('[ti:晴天]\n[ar:周杰伦]\n[00:00.000]晴天\n[00:05.50]故事的小黄花')
    expect(lines).toEqual([
      { time: 0, text: '晴天' },
      { time: 5.5, text: '故事的小黄花' },
    ])
  })

  it('一行多时间戳会展开成交替重复的行', () => {
    const lines = parseLrc('[00:10.00][00:20.000]副歌')
    expect(lines).toEqual([
      { time: 10, text: '副歌' },
      { time: 20, text: '副歌' },
    ])
  })

  it('纯文本歌词不产生时间轴行', () => {
    expect(parseLrc('没有时间戳的歌词')).toEqual([])
    expect(parseLrc(undefined)).toEqual([])
  })

  it('按时间排序', () => {
    const lines = parseLrc('[00:20.000]B\n[00:10.000]A')
    expect(lines.map((l) => l.text)).toEqual(['A', 'B'])
  })
})

describe('findActiveIndex', () => {
  const lines = parseLrc('[00:00.000]A\n[00:10.000]B\n[00:20.000]C')

  it('返回最后一个不晚于当前时间的行', () => {
    expect(findActiveIndex(lines, 0)).toBe(0)
    expect(findActiveIndex(lines, 9.9)).toBe(0)
    expect(findActiveIndex(lines, 10)).toBe(1)
    expect(findActiveIndex(lines, 25)).toBe(2)
  })

  it('尚未开始时返回 -1，空歌词也返回 -1', () => {
    expect(findActiveIndex(lines, -1)).toBe(-1)
    expect(findActiveIndex([], 3)).toBe(-1)
    expect(findActiveIndex(lines, undefined)).toBe(-1)
  })
})
