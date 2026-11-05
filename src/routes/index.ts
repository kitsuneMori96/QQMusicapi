import type { FastifyInstance } from "fastify";
import { registerSearchRoutes } from "./search.ts";
import { registerSongRoutes } from "./song.ts";
import { registerUserRoutes } from "./user.ts";
import { registerLoginRoutes } from "./login.ts";

export interface RouteDeps {
  client: any;
  store: any;
  songService: any;
  shareService: any;
  searchService: any;
}

/** 挂载全部业务路由 */
export function mountAll(
  app: FastifyInstance,
  { client, store, songService, shareService, searchService }: RouteDeps,
): void {
  registerSearchRoutes(app, client, searchService);
  registerSongRoutes(app, client, songService, shareService);
  registerUserRoutes(app, client);
  registerLoginRoutes(app, client, store);
}
