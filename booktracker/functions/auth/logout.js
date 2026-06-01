// functions/auth/logout.js

import { json, clearCookieHeader } from "../_lib/helpers.js";

export async function onRequestPost(context) {
  return json({ ok: true }, 200, { "Set-Cookie": clearCookieHeader() });
}
