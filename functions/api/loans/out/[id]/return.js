// functions/api/loans/out/[id]/return.js

import { json, err } from "../../../../_lib/helpers.js";
import { ensureLoansInColumns } from "../../../../_lib/schema.js";

export async function onRequestPost(context) {
  const { env, data, params } = context;
  await ensureLoansInColumns(env.DB);

  const loan = await env.DB.prepare(
    "SELECT lo.id FROM loans_out lo JOIN books b ON b.id = lo.book_id WHERE lo.id = ? AND b.owner_id = ?"
  ).bind(params.id, data.user.sub).first();

  if (!loan) return err("Loan not found", 404);

  // Also mark the borrower's linked record (if any) as returned
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE loans_out SET returned_at = datetime('now') WHERE id = ?"
    ).bind(params.id),
    env.DB.prepare(
      "UPDATE loans_in SET returned_at = datetime('now') WHERE loan_out_id = ? AND returned_at IS NULL"
    ).bind(params.id),
  ]);

  return json({ ok: true });
}
