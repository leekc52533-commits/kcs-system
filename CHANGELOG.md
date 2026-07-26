# Changelog

## Unreleased — Schema v19

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
