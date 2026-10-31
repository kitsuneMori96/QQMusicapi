import { describe, expect, it } from 'vitest'
import { extractMid, extractShareUrl, formatDuration, coverUrl } from './mid'

describe('extractMid', () => {
  it('从 songDetail 链接中提取', () => {
    expect(extractMid('https://y.qq.com/n/ryqq_v2/songDetail/002kR3lm1nTxkV')).toBe('002kR3lm1nTxkV')
  })

  it('从分享链接的 songmid 参数中提取', () => {
    expect(extractMid('https://i.y.qq.com/n2/m/share/details/song.html?songmid=0039MnYb0qxYhV&x=1')).toBe(
      '0039MnYb0qxYhV',
    )
  })

  it('从 /song/{mid} 路径中提取', () => {
    expect(extractMid('https://example.com/song/001Qu4I30eVFYb')).toBe('001Qu4I30eVFYb')
  })

  it('接受 10–20 位纯 mid', () => {
    expect(extractMid(' 002kR3lm1nTxkV ')).toBe('002kR3lm1nTxkV')
  })

  it('拒绝无法识别的内容', () => {
    expect(extractMid('')).toBe('')
    expect(extractMid('hello world')).toBe('')
    expect(extractMid('abc')).toBe('')
    expect(extractMid('https://y.qq.com/')).toBe('')
  })

  it('短链与 playsong 不直接给出 mid，交由分享解析', () => {
    expect(extractMid('https://c6.y.qq.com/base/fcgi-bin/u?__=rhEMMiIFAphR')).toBe('')
    expect(extractMid('https://i.y.qq.com/v8/playsong.html?songid=1761698')).toBe('')
  })
})

describe('extractShareUrl', () => {
  it('识别 c6 短链并保留原始参数', () => {
    expect(extractShareUrl('https://c6.y.qq.com/base/fcgi-bin/u?__=rhEMMiIFAphR')).toBe(
      'https://c6.y.qq.com/base/fcgi-bin/u?__=rhEMMiIFAphR',
    )
  })

  it('从整段分享文案里挑出链接', () => {
    expect(
      extractShareUrl('分享周杰伦的歌曲《晴天》 https://c6.y.qq.com/base/fcgi-bin/u?__=rhEMMiIFAphR '),
    ).toBe('https://c6.y.qq.com/base/fcgi-bin/u?__=rhEMMiIFAphR')
    expect(extractShareUrl('https://c6.y.qq.com/base/fcgi-bin/u?__=rhEMMiIFAphR，快来听')).toBe(
      'https://c6.y.qq.com/base/fcgi-bin/u?__=rhEMMiIFAphR',
    )
  })

  it('只放行 QQ 音乐域名', () => {
    expect(extractShareUrl('https://example.com/base/fcgi-bin/u?__=x')).toBe('')
    expect(extractShareUrl('https://qq.com.evil.test/u?__=x')).toBe('')
    expect(extractShareUrl('hello world')).toBe('')
  })
})

describe('formatDuration', () => {
  it('按秒输出 m:ss / h:mm:ss', () => {
    expect(formatDuration(59)).toBe('0:59')
    expect(formatDuration(225)).toBe('3:45')
    expect(formatDuration(3661)).toBe('1:01:01')
  })

  it('非法值回落到占位符', () => {
    expect(formatDuration(undefined)).toBe('--:--')
    expect(formatDuration(-1)).toBe('--:--')
    expect(formatDuration(Number.NaN)).toBe('--:--')
  })
})

describe('coverUrl', () => {
  it('拼接固定尺寸封面地址', () => {
    expect(coverUrl('000MkMni19ClKG')).toBe(
      'https://y.gtimg.cn/music/photo_new/T002R300x300M000000MkMni19ClKG.jpg',
    )
    expect(coverUrl('000MkMni19ClKG', 150)).toContain('T002R150x150M000')
  })

  it('缺少 albumMid 时返回空串', () => {
    expect(coverUrl(undefined)).toBe('')
  })
})
