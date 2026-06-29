import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User, TplUser } from "@db/schema";
import { authenticateRequest, authenticateTplRequest } from "./lib/auth";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: User;
  tplUser?: TplUser;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const ctx: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders };
  try {
    // Try KEDI user auth first
    ctx.user = await authenticateRequest(opts.req.headers);
    // If not a KEDI user, try TPL user auth
    if (!ctx.user) {
      ctx.tplUser = await authenticateTplRequest(opts.req.headers);
    }
  } catch {
    // Auth is optional
  }
  return ctx;
}
