/**
 * /user/self 是上游透传结构，字段名随 QQ 版本变化，这里沿用旧页的宽松识别策略：
 * 先扁平化整棵树，再按键名（不区分大小写、只取叶子路径最后一段）匹配。
 * 识别不到时返回空串，由 UI 提示「查看原始 JSON」。
 */

export interface FlatRecord {
  [path: string]: string | number | boolean
}

export interface UserProfile {
  nickname: string
  avatar: string
  uin: string
  gender: string
  vipLevel: string
  isVip: boolean
  region: string
  age: string
  fans: string
  follows: string
  songs: string
  playlists: string
  intro: string
}

const EMPTY: UserProfile = {
  nickname: '',
  avatar: '',
  uin: '',
  gender: '',
  vipLevel: '',
  isVip: false,
  region: '',
  age: '',
  fans: '',
  follows: '',
  songs: '',
  playlists: '',
  intro: '',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 递归收集所有叶子路径，只保留基本类型值 */
export function flattenKeys(value: unknown, prefix = '', out: FlatRecord = {}): FlatRecord {
  if (value === null || value === undefined) return out
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    if (prefix) out[prefix] = value
    return out
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenKeys(item, `${prefix}[${index}]`, out))
    return out
  }
  if (!isRecord(value)) return out

  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (child === null || child === undefined) continue
    if (typeof child === 'object') {
      flattenKeys(child, path, out)
    } else if (typeof child === 'string' || typeof child === 'number' || typeof child === 'boolean') {
      out[path] = child
    }
  }
  return out
}

function leafName(path: string): string {
  const last = path.split('.').pop() ?? path
  return last.split('[')[0]?.toLowerCase() ?? ''
}

function pick(flat: FlatRecord, keys: readonly string[]): string {
  const wanted = keys.map((k) => k.toLowerCase())
  for (const [path, value] of Object.entries(flat)) {
    if (!wanted.includes(leafName(path))) continue
    if (typeof value === 'string' && value.trim() === '') continue
    return String(value)
  }
  return ''
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function pickAvatar(flat: FlatRecord): string {
  const nameKeys = [
    'headpic',
    'headpicurl',
    'avatar',
    'avatarurl',
    'pic',
    'logo',
    'head',
    'portrait',
    'face',
    'photo',
  ]
  for (const [path, value] of Object.entries(flat)) {
    if (!nameKeys.includes(leafName(path))) continue
    if (typeof value === 'string' && isUrl(value)) return value
  }
  for (const value of Object.values(flat)) {
    if (typeof value === 'string' && isUrl(value) && /\.(jpg|jpeg|png|webp|gif)/i.test(value)) {
      return value
    }
  }
  return ''
}

function pickNickname(flat: FlatRecord): string {
  const nameKeys = ['nick', 'nickname', 'strnickname', 'strnick', 'name', 'username', 'displayname']
  for (const [path, value] of Object.entries(flat)) {
    if (!nameKeys.includes(leafName(path))) continue
    if (typeof value !== 'string') continue
    const text = value.trim()
    if (!text || isUrl(text) || !Number.isNaN(Number(text))) continue
    return text
  }
  return ''
}

function truthy(value: string): boolean {
  return value !== '' && value !== '0' && value.toLowerCase() !== 'false'
}

export function deriveProfile(raw: unknown): UserProfile {
  const flat = flattenKeys(raw)
  if (Object.keys(flat).length === 0) return { ...EMPTY }

  const vipLevel = pick(flat, ['viplevel', 'ndiamondlevel', 'diamondlevel', 'diamond'])
  const isVipRaw = pick(flat, ['isvip', 'vipflag', 'bvip', 'isvipuser'])
  const country = pick(flat, ['country', 'countryname'])
  const province = pick(flat, ['province', 'provincename'])
  const city = pick(flat, ['city', 'cityname'])
  const genderRaw = pick(flat, ['gender', 'sex'])

  return {
    nickname: pickNickname(flat),
    avatar: pickAvatar(flat),
    uin: pick(flat, ['uin', 'musicid', 'struin', 'strmusicid', 'uid']),
    gender: genderRaw === '1' ? '男' : genderRaw === '2' ? '女' : genderRaw === '' ? '' : '保密',
    vipLevel,
    isVip: Boolean(vipLevel) || truthy(isVipRaw),
    region: [country, province, city].filter(Boolean).join(' / '),
    age: pick(flat, ['age']),
    fans: pick(flat, ['fansnum', 'fansnumber', 'nfans', 'fans']),
    follows: pick(flat, ['follownum', 'follownumber', 'nfollows', 'follows', 'follow']),
    songs: pick(flat, ['songnum', 'songnumber', 'nsongnum', 'songs']),
    playlists: pick(flat, ['playlistnum', 'songlistnum', 'nsonglist', 'playlist']),
    intro: pick(flat, ['intro', 'signature', 'description', 'strintro', 'sign']),
  }
}
