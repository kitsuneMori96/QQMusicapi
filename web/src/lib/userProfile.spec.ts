import { describe, expect, it } from 'vitest'
import { deriveProfile, flattenKeys } from './userProfile'

describe('flattenKeys', () => {
  it('递归展开对象与数组，只保留叶子', () => {
    const flat = flattenKeys({
      data: { nick: '甲', nums: [1, 2], nested: { deep: { uin: 10086 } } },
      empty: {},
    })
    expect(flat).toEqual({
      'data.nick': '甲',
      'data.nums[0]': 1,
      'data.nums[1]': 2,
      'data.nested.deep.uin': 10086,
    })
  })

  it('忽略 null / undefined / 空对象', () => {
    expect(flattenKeys({ a: null, b: undefined, c: {} })).toEqual({})
  })
})

describe('deriveProfile', () => {
  it('识别常见字段（含嵌套与数组）', () => {
    const profile = deriveProfile({
      data: {
        nick: '夜曲',
        headpic: 'https://thirdwx.qlogo.cn/x.jpg',
        uin: 10086,
        gender: 1,
        vip: { level: 8 },
        location: { country: '中国', province: '广东', city: '深圳' },
        age: 18,
        fans: 12,
        follows: 3,
        intro: '一句话签名',
      },
    })
    expect(profile.nickname).toBe('夜曲')
    expect(profile.avatar).toContain('qlogo')
    expect(profile.uin).toBe('10086')
    expect(profile.gender).toBe('男')
    expect(profile.region).toBe('中国 / 广东 / 深圳')
    expect(profile.intro).toBe('一句话签名')
  })

  it('VIP 与性别按旧页规则归一', () => {
    expect(deriveProfile({ viplevel: 5 }).isVip).toBe(true)
    expect(deriveProfile({ isvip: 1 }).isVip).toBe(true)
    expect(deriveProfile({ isvip: 0 }).isVip).toBe(false)
    expect(deriveProfile({ gender: 2 }).gender).toBe('女')
    expect(deriveProfile({ gender: 0 }).gender).toBe('保密')
  })

  it('头像优先按键名匹配，回落到图片 URL', () => {
    expect(deriveProfile({ avatar: 'https://a.com/a.png' }).avatar).toBe('https://a.com/a.png')
    expect(deriveProfile({ whatever: 'https://a.com/b.png' }).avatar).toBe('https://a.com/b.png')
  })

  it('昵称不取数字与 URL', () => {
    expect(deriveProfile({ name: '123456' }).nickname).toBe('')
    expect(deriveProfile({ name: 'https://x.y/z' }).nickname).toBe('')
    expect(deriveProfile({ strNick: '真名' }).nickname).toBe('真名')
  })

  it('空响应返回全空结构', () => {
    expect(deriveProfile(null).nickname).toBe('')
    expect(deriveProfile({}).isVip).toBe(false)
  })
})
