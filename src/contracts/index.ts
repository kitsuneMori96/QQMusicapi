/**
 * 契约层唯一入口.
 *
 * 前端(web/)可直接 `import type { SongDetailData } from "../../src/contracts/index.ts"`,
 * 类型导入在构建时完全擦除, 不会引入任何运行时代码.
 */

export type { ApiOk, ApiFail, ApiEnvelope, UnknownRecord } from "./common.ts";
export type { HealthData } from "./health.ts";
export type {
  SingerRef,
  AlbumRef,
  SongTrack,
  SongDetailData,
  PlayUrlInfo,
  SongUrlsData,
  LyricData,
  SimilarData,
  RelatedSonglistData,
  ShareResolveData,
} from "./song.ts";
export type {
  QrLoginTypeValue,
  CredentialJSON,
  LoginStatusData,
  LoginCredentialData,
  QrCodeData,
  QrCheckData,
  SendAuthcodeData,
  PhoneLoginData,
  QrCodeBody,
  QrCheckBody,
  SendAuthcodeBody,
  PhoneLoginBody,
} from "./login.ts";
export { QrEvent } from "./login.ts";
export type {
  SearchTypeValue,
  SearchHotkeyData,
  SearchCompleteData,
  SearchQuickData,
  SearchGeneralData,
  SearchByTypeData,
  SearchGeneralBody,
  SearchByTypeBody,
  SongSearchItem,
  SongSearchData,
  AlbumSearchItem,
  AlbumSearchData,
  SonglistSearchItem,
  SonglistSearchData,
} from "./search.ts";
export { SearchType } from "./search.ts";
export type { CollectionTrack, AlbumDetailData, SonglistDetailData } from "./collection.ts";
export type {
  UserSelfData,
  UserInfoData,
  UserSonglistData,
  UserFollowsData,
  UserFansData,
  UserFollowBody,
} from "./user.ts";

export type {
  SongDetailQuery,
  SongUrlsQuery,
  SongLyricQuery,
  SongSimilarQuery,
  SongRelatedQuery,
  SongDownloadQuery,
  SongResolveQuery,
  LoginQrCodeBody,
  LoginQrCheckBody,
  LoginSendAuthcodeBody,
  LoginPhoneBody,
  LoginCredentialBody,
  SearchKeywordQuery,
  SearchGeneralBody as SearchGeneralBodySchema,
  SearchByTypeBody as SearchByTypeBodySchema,
  UserUinQuery,
  UserPageQuery,
  UserFollowBody as UserFollowBodySchema,
} from "./schemas.ts";
