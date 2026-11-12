// functions/api/loans/in/[id]/return.js

import { json, err } from "../../../../_lib/helpers.js";
import { ensureLoansInColumns } from "../../../../_lib/schema.js";

export async function onRequestPost(context) {
  const { env, data, params } = context;
  await ensureLoansInColumns(env.DB);

  const loan = await env.DB.prepare(
    "SELECT id, loan_out_id FROM loans_in WHERE id = ? AND owner_id = ?"
  ).bind(params.id, data.user.sub).first();

  if (!loan) return err("Loan not found", 404);

  const updates = [
    env.DB.prepare(
      "UPDATE loans_in SET returned_at = datetime('now') WHERE id = ?"
    ).bind(params.id),
  ];
  // If the lender logged this loan in their own account, mark it returned there too
  if (loan.loan_out_id) {
    updates.push(env.DB.prepare(
      "UPDATE loans_out SET returned_at = datetime('now') WHERE id = ? AND returned_at IS NULL"
    ).bind(loan.loan_out_id));
  }
  await env.DB.batch(updates);

  return json({ ok: true });
}
