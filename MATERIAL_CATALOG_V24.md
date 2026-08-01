# Material Catalogue and Price Groups — Schema v24

Schema v24 adds a non-destructive catalogue layer: `Material Category → Product / Grade → Price Group → Branch Assignment`.

Initial mapping is limited to approved relationships: Paper (OCC, Mixed Paper, Newspaper, Black & White Paper), Aluminium (Aluminum Can, Aluminium Angle, Mixed Alloy), Scrap Iron (G1 and G2). Every other Product is placed in the system-reserved `Uncategorized` Category. Existing Material, Product, Price Level, OCC Group, invoice and audit identifiers remain unchanged.

The migration creates `material_categories`, category history, generic Branch Product Price Group assignments and history, group-price history, material-master audit and merge tracking. It migrates only one-to-one provable non-OCC relationships obtained from an active Customer Product price plus the Branch's existing selectable Product. Ambiguous Price Levels remain unassigned. It never changes prices, OCC assignments, invoice snapshots, dispatch records or legacy item records.

The Materials workspace now follows the four levels. `Change Group Price` keeps Branches in the stable Price Group and records old/new price, effective date, reason and operator. `Move Branches` changes selected Branch assignments between Price Groups of the same Product. Both operations use one SQLite transaction and preserve history. Delete eligibility blocks any record with references; Merge, Archive and Hide require explicit preview/confirmation and are never run by migration.

Deployment requires a stopped API, WAL checkpoint, verified SQLite backup, `node scripts/migrate-v24.mjs`, `PRAGMA integrity_check`, count reconciliation, build, service restart and Health checks. Rollback restores the pre-v24 database backup and previous Git commit while the API is stopped. Do not run a down migration.
