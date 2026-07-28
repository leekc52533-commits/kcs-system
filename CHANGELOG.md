# Changelog

## 2026-07-28 — Three-language interface

- Expanded English, Bahasa Melayu and Chinese module dictionaries.
- Added client API error localisation and stable server error codes.
- Added validation preventing CJK characters in new or edited addresses and official place names.
- Changed new-database Zone initialization and fixtures to English/Bahasa Melayu names.
- Preserved existing v19 databases; no migration or production data change is included.
- Removed unused `DispatchPage.jsx` after confirming it was absent from App, tests and production routing.

## Unreleased — Schema v19

- Added explicit `removedMaterialIds` handling for Customer Material Pricing. Unused pricing is safely deactivated and audited; referenced pricing and cross-Customer removal are rejected or ignored without dangling references.
- Branch optional fields are now collected from the submitted HTML form, so an intentional empty string reliably reaches the API and becomes `NULL`; omitted API fields still preserve the stored value.
- Fixed Customer Special Price checkbox state overwrite by applying one functional, atomic pricing update; the amount input now appears immediately and validates non-negative values with up to three decimal places.
- Branch optional text fields now distinguish untouched fields from an intentional blank; clearing Notes writes `NULL` and remains visible in audit history.
- Fixed consecutive Customer Branch editing: each modal reloads by BranchID, prevents stale responses, resets validation state, closes only after a confirmed save, and refreshes the list.
- Standard, Outstation and Customer Special Price selectors now show the resolved RM/kg price immediately.
- Centralized Collection Frequency and weekday normalization for frontend and backend, including blank/legacy values and field-specific validation errors.
- Added Customer-level Standard Price and optional Outstation Price per Material.
- Added Branch Standard/Outstation selection without duplicating new actual prices.
- Migrated existing v18 Branch Materials to Standard with an idempotent legacy-price compatibility fallback.
- Added Customer pricing and Branch selection audit history, affected Branch lists and second confirmation.
- Added stable Customer + Branch + Material price resolution and immutable completed-stop snapshot tests.
- Added strict v17 → v18 → v19 migration and rollback documentation. AWS was not deployed.

## Unreleased — Schema v18

- Added Materials, unlimited Price Levels, Branch Price Lists and Special Prices.
- Converted legacy OCC prices into shared, idempotent OCC Price Levels.
- Added price change and branch assignment audit history plus dispatch stop price snapshots.
- Replaced Customer Branch OCC Price UI with multi-Material selection.
- Added Collection Frequency choices, multi-select weekdays, mismatch warning, On Call and Paused behavior.
- Added server-side `price_manage` authorization.
- Fixed Account/Profile outside-click and Escape closing.
- Made the sidebar independently scrollable and safe above the operating-system taskbar.
- Added v18 migration, test, backup, deployment and rollback documentation. AWS was not deployed.
