// functions/api/loans/out/[id]/return.js

import { json, err } from "../../../../_lib/helpers.js";

export async function onRequestPost(context) {
  const { env, data, params } = context;

  const loan = await env.DB.prepare(
    "SELECT lo.id FROM loans_out lo JOIN books b ON b.id = lo.book_id WHERE lo.id = ? AND b.owner_id = ?"
  ).bind(params.id, data.user.sub).first();

  if (!loan) return err("Loan not found", 404);

  await env.DB.prepare(
    "UPDATE loans_out SET returned_at = datetime('now') WHERE id = ?"
  ).bind(params.id).run();

  return json({ ok: true });
}
