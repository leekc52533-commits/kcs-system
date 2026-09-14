# KCS UI Guidelines

For screens with many business records, use a compact table or list with clear rows and columns, search, filters, sorting, a per-user column chooser, and expandable details. Keep primary identifiers and essential actions visible. Use cards mainly for KPIs, summaries, warnings, and a small number of important states—not for dozens or hundreds of records.

- Single-action and single-select menus close immediately after a choice. Multi-select filters and column choosers stay open until the user closes them or clicks outside.
- Copy controls appear only where copying has a practical operational purpose (for example phone, GPS coordinates, username, and identifiers in details). Do not add a copy icon to every ID in dense list rows.
- Toolbars use compact icon-and-text actions. Format choices such as XLSX and CSV belong in a small menu rather than separate large buttons.
- Detailed fields belong in expandable rows or detail views instead of being spread across the main list.
- Interactive elements retain pointer, hover, focus-visible, and pressed feedback. Read-only content must not appear interactive.
- Mobile layouts must avoid page-level horizontal overflow. A wide data table may use its own contained horizontal scroll.

## Saved column arrangement — confirmed by KC, 2026-09-14

Use Expense Records as the interaction reference for new and updated business tables:

- Include a compact column-arrangement icon in the table toolbar, with a translated tooltip and accessible name (English, Bahasa Melayu, Chinese).
- Let users choose which heading/column comes first, next, and last. Reorder the full column: its heading and every corresponding data cell must remain aligned.
- In the arrangement window, let the user press and hold a column name/row and drag it up or down to the desired position, then release. Do not require repeated single-step arrow clicks for long moves. Retain arrows as an accessible fallback and explain the drag option visibly.
- Require an explicit Save for committing the order. Offer Restore default. Closing an unsaved arrangement must not persist it.
- Remember saved order on later visits; state whether preferences are local to the browser or synced to an account. The current Expense Records reference is browser-local. Do not imply cross-device/company-wide synchronization without implementing it.
- Preserve existing saved choices when columns are added: keep known keys in their saved order, remove obsolete/duplicate keys safely, and include newly introduced columns.
- Retain existing search, column filters, sorting, authorization and readable/touch-friendly controls. Rearranging display columns must never reorder business records or change transaction data.
- Reuse/adapt the ExpenseColumnOrder interaction rather than introducing conflicting table arrangement patterns. Legacy pages adopt this standard as they are updated; do not claim an all-system rollout from this guideline update alone.
