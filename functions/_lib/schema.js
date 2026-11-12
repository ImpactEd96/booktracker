// functions/_lib/schema.js
// Adds columns that were introduced after the original schema to databases
// created before them. Runs at most once per Worker instance, and is safe if
// several instances try at the same time.

const LOANS_IN_COLUMNS = { isbn: "TEXT", cover_url: "TEXT" };

let loansInReady = null;

export function ensureLoansInColumns(db) {
  if (!loansInReady) {
    loansInReady = addMissingColumns(db, "loans_in", LOANS_IN_COLUMNS).catch((e) => {
      loansInReady = null; // try again on the next request
      throw e;
    });
  }
  return loansInReady;
}

async function addMissingColumns(db, table, columns) {
  const { results } = await db.prepare(`PRAGMA table_info(${table})`).all();
  const existing = new Set(results.map((col) => col.name));

  for (const [name, type] of Object.entries(columns)) {
    if (existing.has(name)) continue;
    try {
      await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`).run();
    } catch (e) {
      // Another instance may have added it between our check and now
      if (!/duplicate column/i.test(String(e?.message ?? e))) throw e;
    }
  }
}
