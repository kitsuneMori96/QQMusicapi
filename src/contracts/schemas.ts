/**
 * 请求侧 schema (TypeBox).
 *
 * 同一份定义同时产出:
 *   1. Fastify 运行时校验 (querystring / body)
 *   2. 由 Static<> 推导的 TS 类型
 *
 * 响应侧结构多为上游透传, 不做序列化 schema, 避免误删上游新增字段.
 */

import { Type, type Static } from "@sinclair/typebox";

const nonEmptyString = Type.String({ minLength: 1 });

// ==================== song ====================

export const SongDetailQuerySchema = Type.Object({
  mids: nonEmptyString,
});
export type SongDetailQuery = Static<typeof SongDetailQuerySchema>;

export const SongUrlsQuerySchema = Type.Object({
  mids: nonEmptyString,
  type: Type.Optional(Type.String()),
});
export type SongUrlsQuery = Static<typeof SongUrlsQuerySchema>;

export const SongLyricQuerySchema = Type.Object({
  mid: nonEmptyString,
  /** "0" 关闭 QRC 解密, 其余按开启处理 */
  decode: Type.Optional(Type.String()),
  /** text: 把解密后的 QRC XML 还原为纯 LRC 文本 (剥掉逐字时间标记) */
  format: Type.Optional(Type.String({ enum: ["text"] })),
  /** 取哪一轨; download=1 时只回这一轨, JSON 时三轨都在 */
  kind: Type.Optional(Type.String({ enum: ["lyric", "trans", "roma"] })),
  /** "1": 不再回 JSON 信封, 直接回 text/plain + Content-Disposition 的 .lrc 文件 */
  download: Type.Optional(Type.String()),
});
export type SongLyricQuery = Static<typeof SongLyricQuerySchema>;

export const SongSimilarQuerySchema = Type.Object({
  songid: Type.Optional(Type.String()),
  id: Type.Optional(Type.String()),
});
export type SongSimilarQuery = Static<typeof SongSimilarQuerySchema>;

export const SongRelatedQuerySchema = Type.Object({
  mid: nonEmptyString,
});
export type SongRelatedQuery = Static<typeof SongRelatedQuerySchema>;

export const SongDownloadQuerySchema = Type.Object({
  mid: nonEmptyString,
  type: Type.Optional(Type.String()),
});
export type SongDownloadQuery = Static<typeof SongDownloadQuerySchema>;

export const SongResolveQuerySchema = Type.Object({
  /** QQ 音乐分享链接 (短链 / playsong / songDetail) */
  url: nonEmptyString,
});
export type SongResolveQuery = Static<typeof SongResolveQuerySchema>;

// ==================== login ====================

export const LoginQrCodeBodySchema = Type.Object({
  type: Type.Optional(Type.Union([Type.Literal("qq"), Type.Literal("wx"), Type.Literal("mobile")])),
});
export type LoginQrCodeBody = Static<typeof LoginQrCodeBodySchema>;

export const LoginQrCheckBodySchema = Type.Object({
  identifier: nonEmptyString,
  type: Type.Optional(Type.Union([Type.Literal("qq"), Type.Literal("wx")])),
});
export type LoginQrCheckBody = Static<typeof LoginQrCheckBodySchema>;

export const LoginSendAuthcodeBodySchema = Type.Object({
  phone: Type.Union([Type.String(), Type.Number()]),
  countryCode: Type.Optional(Type.Number()),
});
export type LoginSendAuthcodeBody = Static<typeof LoginSendAuthcodeBodySchema>;

export const LoginPhoneBodySchema = Type.Object({
  phone: Type.Union([Type.String(), Type.Number()]),
  code: nonEmptyString,
});
export type LoginPhoneBody = Static<typeof LoginPhoneBodySchema>;

export const LoginCredentialBodySchema = Type.Object({}, { additionalProperties: true });
export type LoginCredentialBody = Static<typeof LoginCredentialBodySchema>;

// ==================== search ====================

export const SearchKeywordQuerySchema = Type.Object({
  keyword: nonEmptyString,
});
export type SearchKeywordQuery = Static<typeof SearchKeywordQuerySchema>;

export const SearchGeneralBodySchema = Type.Object({
  keyword: nonEmptyString,
  page: Type.Optional(Type.Number()),
  num: Type.Optional(Type.Number()),
  searchid: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  pageStart: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  highlight: Type.Optional(Type.Boolean()),
});
export type SearchGeneralBody = Static<typeof SearchGeneralBodySchema>;

export const SearchByTypeBodySchema = Type.Object({
  keyword: nonEmptyString,
  type: Type.Optional(Type.Number()),
  num: Type.Optional(Type.Number()),
  page: Type.Optional(Type.Number()),
  searchid: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  highlight: Type.Optional(Type.Boolean()),
});
export type SearchByTypeBody = Static<typeof SearchByTypeBodySchema>;

// ==================== user ====================

export const UserUinQuerySchema = Type.Object({
  uin: nonEmptyString,
});
export type UserUinQuery = Static<typeof UserUinQuerySchema>;

export const UserPageQuerySchema = Type.Object({
  uin: nonEmptyString,
  page: Type.Optional(Type.String()),
  num: Type.Optional(Type.String()),
});
export type UserPageQuery = Static<typeof UserPageQuerySchema>;

export const UserFollowBodySchema = Type.Object({
  uin: nonEmptyString,
  follow: Type.Optional(Type.Boolean()),
});
export type UserFollowBody = Static<typeof UserFollowBodySchema>;
