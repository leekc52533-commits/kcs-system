# KCS Frequency Recurrence Test Report

## Automated checks

- New v26 recurrence and Dispatch regression set: 64/64 passed.
- Final full project suite: 239/239 passed. Before the final run, the expected schema assertion was updated from v25 to v26 and a date-sensitive future-route fixture was moved from the now-historical 2026-08-03 to 2030-08-05.
- Lint: passed with three pre-existing Fast Refresh warnings in `src/MasterDataPage.jsx`.
- Production build: passed; Vite reported the existing large-chunk advisory.

Coverage includes 14/21-day cycles, cross-month/year, leap-year February, First–Fourth/Last monthly weekdays, rejection of fifth occurrence, Anchor/Effective Date ordering, exception behavior, duplicate occurrence/Dispatch prevention, transaction rollback, On Call, Paused, Sunday whitelist, legacy frequencies, existing-weekday preservation, v25→v26 migration, and repeated migration.

## Database-copy rehearsal

The source snapshot `C:/Tmp/kcs-occ-frequency-post.sqlite` remained SHA-256 `4F48F48BC6F53C3C9F5B0CB81A89497FC591BF89DBF99087407D7A59D97CA84D` before and after.

On `C:/Tmp/kcs-frequency-v26-rehearsal.sqlite`, the first run upgraded v25→v26 and the second run was a no-op. Integrity was `ok`. Counts remained: Branch 480, Schedule 276, existing weekday 264, Dispatch 396, Dispatch Stop 681. `schedule_occurrences` remained 0 because migration does not generate routes.

## Write proof

Formal database writes: 0. Formal weekday changes: 0. Formal Schedule changes: 0. Dispatch additions: 0. Dispatch Stop additions: 0. Pushes: 0. Deployments: 0.
