# Changelog

## Schema v24

- Added stable Material Categories with approved Paper, Aluminium and Scrap Iron mappings; all other Products remain Uncategorized.
- Added generic non-OCC Branch Price Group assignment, whole-group repricing, Branch moves, audit/history, and guarded Delete/Merge/Archive/Hide management.
- Preserved all existing Product, Price Level, OCC Group and historical snapshot identifiers and values.
- Changed the Materials workspace to Category → Product → Price Group → Branch detail navigation with a single hierarchy back control.

## 2026-07-30 — Schema v22 Material Products

- Added `Material → Product → Price Group`; G1 and G2 are separate Products under the existing Iron Material.
- Added Full Name, Short Form, controlled Unit, fixed product Price Groups, Legacy Item mapping and future invoice snapshot fields.
- Added idempotent five-product Branch availability for OCC, MIX PLASTIC, SALI/TIN, G1 and G2 without inventing prices.
- Added a default dry-run conversion program, transactional explicit apply, unresolved-mapping safety gate and a read-only material issue report.
- No AWS deployment or production conversion is included.

## 2026-07-28 — Final production CJK source cleanup

- Replaced the remaining hard-coded Chinese in production JSX, fallbacks, prompts, placeholders, status text and import/export surfaces with translated or English-canonical source text.
- Added actual React component rendering through Vite SSR and JSDOM for Customer Branch, GPS Collector, Buyer, Operational Location and Excel/CSV Import & Export in English and Bahasa Melayu.
- Added a production-source CJK gate that reports the exact file, line and source text. Chinese is now limited to translation resources, tests and validation logic; dynamic business values are explicitly marked `data-i18n-raw`.
- No database, schema, migration or AWS operation is part of this change.

## 2026-07-28 — Production route i18n acceptance follow-up

- Removed remaining Chinese route labels, placeholders, empty states and status text from English and Bahasa Melayu rendering across Special Requests, Customer/Branch, Schedules, Data Quality, GPS recommendations, Employee, Vehicle, Location/Zone, GPS migration and Jodoo import surfaces.
- Added route-surface regression matrices for English and Bahasa Melayu, including the acceptance examples missed by the earlier key-only coverage.
- Replaced the unreliable browser `prompt()` used by Zone Rename with an accessible application Modal supporting translated validation, CJK place-name rejection, busy/error states, cancel and refresh-after-save.
- Kept all Customer, Branch, address, Area, Operational Location and Zone database values raw and unchanged. Schema remains v19; no migration or AWS data operation is included.

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
# Schema v25 — Material Category management

- Added an independent OCC Category, ordered before Paper; Paper now contains the remaining three Products.
- Preserved OCC Product, Price Group, Branch assignment, pricing and history IDs during migration.
- Added audited Category create/edit, Product reassignment, and safe empty-Category deletion with Preview → Confirm workflows.
- Improved Confirm Group Price Change layout for desktop and single-column mobile use.
