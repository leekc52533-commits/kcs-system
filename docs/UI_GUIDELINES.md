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

## 2026-11-03 — All table exports follow the current page layout

KC confirmed this is a permanent, system-wide requirement, including every new page:
- Use the SAME ordered/visible column model for screen headers, cells and export. Never maintain an independent fixed export order. A saved column rearrangement takes effect on the next download without a code change.
- Export the corresponding authorized dataset with current filters and record sorting plus the explicitly selected export dates. Do not limit full exports to a displayed pagination page.
- Pass stable column keys to server-generated workbooks; validate against the server whitelist. Keep values, numeric/date formats, totals and hyperlinks attached to their keys after rearrangement.
- Exclude action-only controls. Preserve export-only item detail, audit fields and evidence in supplementary columns/sheets after the screen columns; retain embedded proofs and photos. Do not scrape business values from the DOM.
- Non-tabular printable bills, account statements, import templates, original receipts/photos and sensitive-data transfer formats retain their dedicated formats. This rule does not change their legal/operational content or access restrictions.
- For browser-generated exports use DataExportButton with the same `order`/`visibleColumns` as the table; for server exports use `orderedExportColumns`/`exportColumnOrder` and the live page order. Column preferences remain browser-local where that is the current storage model.

- KC confirmed 2026-11-03: all shared date inputs accept day/month shortcuts (31/10), numeric two/four-digit years (31/10/26, 31/10/2026) and DD-MMM-YY. Omitted year uses the field's existing/reference year, or the current Asia/Kuching year for an empty field. Enter or blur normalizes display to DD-MMM-YY; Enter confirms only the date and must not submit/download. Keep ISO values internally, strict calendar/leap-year/time/range validation, invalid drafts and native calendar controls. New pages must reuse DateInput.

- KC confirmed 2026-11-03: shared editable date fields select their existing text on entry (autofocus, Tab or first click), so typing replaces it without deleting first. Preserve the date when nothing is typed, subsequent caret editing, and native calendar controls. Export dialogs autofocus the start date.

- KC confirmed 2026-11-03: date-range exports run through the app-level background export tray. Close the date dialog immediately, preserve work across in-app navigation, auto-download completed files and retain a manual download link. Show generation/transfer/error states in zh/en/ms, prevent concurrent heavy exports, revoke temporary URLs on dismissal/logout, and explain that browser refresh/closure interrupts the task. Expense workbook photos use smaller export copies with original-proof fallback; never overwrite originals. Log query/photo/format/pack timing and byte counts.
