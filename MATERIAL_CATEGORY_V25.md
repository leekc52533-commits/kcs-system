# Material Category Schema v25

Schema v25 separates OCC from Paper without replacing any Product or pricing record. The migration creates the `OCC` Category, assigns the existing OCC Product to it, and normalizes Category order to OCC, Paper, Aluminium, Scrap Iron, and Uncategorized.

The migration preserves Product IDs, Price Level IDs, prices, Branch assignments, assignment history, price history, and business history. It runs in one transaction, asserts that exactly one OCC Product exists and Paper contains three Products afterward, and is a no-op when rerun.

Category management now supports audited Preview → Confirm flows:

- Add and edit Category with trimmed, case-insensitive unique names.
- Move selected Products between Categories while retaining Product and Price Group identity and all Branch/history relationships.
- Delete only an empty, non-system-reserved Category after a fresh server-side eligibility check.
- `Uncategorized` remains system reserved and can send or receive Products but cannot be deleted.

Production deployment must use `npm run migrate:v25` against an explicit `KCS_DB_PATH` only after a verified SQLite backup. This development change does not migrate or modify the production database.
