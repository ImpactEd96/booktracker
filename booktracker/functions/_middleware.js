// functions/_middleware.js
// Protects all /api/* routes — passes through /auth/* unauthenticated

import { verifyJWT } from "./_lib/crypto.js";
import { getCookieToken, err } from "./_lib/helpers.js";

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/")) {
    return next();
  }

  const token = getCookieToken(request);
  if (!token) return err("Unauthorised", 401);

  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload) return err("Unauthorised", 401);

  context.data.user = payload;
  return next();
}
