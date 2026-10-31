/**
 * 契约层类型出口。
 *
 * 仓库根的 src/contracts 是前后端唯一契约来源，前端只 `import type`，
 * 构建时完全擦除；此处集中转换，避免各组件散落 ../../.. 相对路径。
 */
export type {
  ApiEnvelope,
  HealthData,
  SingerRef,
  AlbumRef,
  SongTrack,
  SongDetailData,
  PlayUrlInfo,
  SongUrlsData,
  LyricData,
  SimilarData,
  LoginStatusData,
  CredentialJSON,
  QrCodeData,
  QrCheckData,
  SendAuthcodeData,
  PhoneLoginData,
  UserSelfData,
} from '../../../src/contracts/index.ts'

/** 组件内更顺手的别名：契约里的 SongTrack 就是「曲目」 */
export type { SongTrack as Track } from '../../../src/contracts/index.ts'
