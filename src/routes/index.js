import { searchRouter } from "./search.js";
import { songRouter } from "./song.js";
import { userRouter } from "./user.js";
import { loginRouter } from "./login.js";

/** 挂载全部业务路由 */
export function mountAll(app, { client, store, songService }) {
  app.use(searchRouter(client).routes());
  app.use(songRouter(client, songService).routes());
  app.use(userRouter(client).routes());
  app.use(loginRouter(client, store).routes());
}
