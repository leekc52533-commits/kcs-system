# Price catalogue and master-page consolidation (Schema v23)

## Existing capabilities reused

- OCC Branch assignments already reference a stable `occ_price_groups.id`.
- Branch transfers already run in one transaction and write assignment history.
- Product hierarchy, Branch product availability, `Price Not Set` protection, permissions and immutable dispatch price snapshots already exist.
- Employee import preview/export, sensitive-data permission checks and Zone rename modal are retained.

## Changes

- v23 removes the old `Material + price` uniqueness rule for OCC groups. Separate Group IDs may temporarily share the same current price.
- Group repricing changes the group, not its Branch assignments, and records old/new price, Branch count, operator, date and reason.
- Future-dated prices are stored as pending and do not replace the current price early.
- OCC home hides unused groups by default and shows `Price Not Set`; a group opens searchable Branch management.
- Employee and Zone creation use modals. Employee exports/imports are under `Data tools`.
- Master-data pages no longer show Area/Zone statistics or the ambiguous global import/export tab.

## Safety and deployment

Run `npm run migrate:v23` only with an explicit `KCS_DB_PATH`, after stopping the API and verifying a SQLite backup. The migration is transactional and preserves Group IDs, Branch assignments, assignment history and invoice snapshots. It does not import or alter business prices.
