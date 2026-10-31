/**
 * 用户域契约.
 *
 * 除分页参数外均为上游透传结构.
 */

import type { UnknownRecord } from "./common.ts";

export type UserSelfData = UnknownRecord;
export type UserInfoData = UnknownRecord;
export type UserSonglistData = UnknownRecord;
export type UserFollowsData = UnknownRecord;
export type UserFansData = UnknownRecord;

export interface UserFollowBody {
  uin: string;
  follow?: boolean;
}
