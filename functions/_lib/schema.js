// functions/_lib/schema.js
// Brings databases created from an older schema.sql up to date. Each check
// runs at most once per Worker instance, and is safe if several instances
// try at the same time.

const LOANS_IN_COLUMNS = { isbn: "TEXT", cover_url: "TEXT", loan_out_id: "TEXT" };

let loansInReady = null;
let authAttemptsReady = null;

export function ensureLoansInColumns(db) {
  if (!loansInReady) {
    loansInReady = (async () => {
      const added = await addMissingColumns(db, "loans_in", LOANS_IN_COLUMNS);
      if (added.includes("loan_out_id")) await linkExistingLoans(db);
    })().catch((e) => {
      loansInReady = null; // try again on the next request
      throw e;
    });
  }
  return loansInReady;
}

// Failed sign-ins and sign-ups, used to limit attempts (see ratelimit.js)
export function ensureAuthAttemptsTable(db) {
  if (!authAttemptsReady) {
    authAttemptsReady = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS auth_attempts (
        kind TEXT NOT NULL, email TEXT, ip TEXT, attempted_at INTEGER NOT NULL)`),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_auth_attempts_time ON auth_attempts(attempted_at)"),
    ]).catch((e) => {
      authAttemptsReady = null;
      throw e;
    });
  }
  return authAttemptsReady;
}

// Adds any missing columns and returns the names of the ones it added
async function addMissingColumns(db, table, columns) {
  const { results } = await db.prepare(`PRAGMA table_info(${table})`).all();
  const existing = new Set(results.map((col) => col.name));
  const added = [];

  for (const [name, type] of Object.entries(columns)) {
    if (existing.has(name)) continue;
    try {
      await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`).run();
      added.push(name);
    } catch (e) {
      // Another instance may have added it between our check and now
      if (!/duplicate column/i.test(String(e?.message ?? e))) throw e;
    }
  }
  return added;
}

// Borrowed-book records that were created automatically from someone else's
// loan (before loan_out_id existed) get linked to that loan, and their
// "returned" status is brought in line. Runs once, when the column is added.
async function linkExistingLoans(db) {
  try {
    await db.batch([
      db.prepare(`
        UPDATE loans_in SET loan_out_id = (
          SELECT lo.id FROM loans_out lo
          JOIN books b ON b.id = lo.book_id
          JOIN users lender ON lender.id = lo.lender_id
          JOIN users borrower ON borrower.email = lower(lo.borrower_email)
          WHERE borrower.id = loans_in.owner_id
            AND lender.email = lower(loans_in.lender_email)
            AND b.title = loans_in.title
            AND b.author = loans_in.author
            -- both records were created by the same request, so within moments
            AND abs(julianday(lo.loaned_at) - julianday(loans_in.borrowed_at)) < 5.0 / 1440
          LIMIT 1
        )
        WHERE loan_out_id IS NULL AND lender_email IS NOT NULL`),
      db.prepare(`
        UPDATE loans_in SET returned_at = (
          SELECT lo.returned_at FROM loans_out lo WHERE lo.id = loans_in.loan_out_id)
        WHERE returned_at IS NULL AND loan_out_id IS NOT NULL
          AND (SELECT lo.returned_at FROM loans_out lo WHERE lo.id = loans_in.loan_out_id) IS NOT NULL`),
      db.prepare(`
        UPDATE loans_out SET returned_at = (
          SELECT li.returned_at FROM loans_in li
          WHERE li.loan_out_id = loans_out.id AND li.returned_at IS NOT NULL LIMIT 1)
        WHERE returned_at IS NULL
          AND EXISTS (SELECT 1 FROM loans_in li
                      WHERE li.loan_out_id = loans_out.id AND li.returned_at IS NOT NULL)`),
    ]);
  } catch (e) {
    // Not worth breaking the Borrowed list over — old records just stay unlinked
    console.error("Linking existing loans failed:", e);
  }
}
