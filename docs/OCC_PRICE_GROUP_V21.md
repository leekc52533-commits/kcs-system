# OCC Price Group Schema v21

Schema v21 creates 46 fixed OCC groups from RM0.15/kg through RM0.60/kg in RM0.01 increments.

- Product plus price and Item Code are unique.
- Branch assignments and every old/new group transition are stored separately.
- Fixed groups have no price-edit operation. Create a new custom group when a genuinely new price is required.
- Used groups cannot be hidden.
- Bulk transfer validates all selected Branches against the source and commits atomically; exceptional Branches can be deselected.
- Completed dispatch snapshots keep their original price, Item Code and group ID.
- The idempotent migration does not assign, convert, merge or clean existing Branch prices.

Production must migrate v19 → v20 → v21 with backups and explicit `KCS_DB_PATH`. Never replace production SQLite with a local file.
