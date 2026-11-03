# Table export layout — 03-Nov-26

Permanent requirement: see AGENTS.md and UI_GUIDELINES.md. This applies to future pages as well as existing table exports. Preferences remain in the browser unless a page already stores them elsewhere.

## Implementation inventory

| Export path | Layout source / verification |
| --- | --- |
| Expense Records | Sends saved columnOrder to server; whitelist maps screen keys to workbook fields. Totals/date/money formats are keyed, receipt-photo sheet retained. |
| Purchase Bills | Sends screen columns to server. Screen columns precede item-detail/legacy void fields; proof links and numeric formats are keyed. Customer receipt button is an action, not a data column. |
| Sales | Sends salesColumns; server validates order against shared sales keys. Bill Photos retained. |
| Cash Float ledger | Sends archiveKeys.ledger; visible reference uses bill/reference fallback. Separate legacy Reference retained last. |
| Daily Cash Spending | Fixed table order already matched; explicitly requests newest-date-first, keeps totals last and supplemental expense sheet. |
| Unloading | Existing saved order and language reused. Explicit download dates take precedence over historical-date lookup. |
| Void | Existing order.map feeds both screen and DataExportButton. |
| Customer master, compact master tables, attendance, earnings, collection history, daily-report detail | Already share order/visibleColumns/shownColumns with DataExportButton; keep visibility and filters. |
| Employee directory, leave, notices, vehicle maintenance/expenses, sale prices | Existing same column arrays and current displayed rows feed export and table. |
| Customer branch list | GPS status added in its visible position; address/contact detail remains supplementary. |
| OCC/product price assignment tables | Existing displayed order retained; missing price/branch-count/status fields added. |
| GPS import review | Existing grouped customer/GPS display expands into adjacent underlying fields; review metadata remains supplemental. |
| Other master/geographic/route/collector/special-intake views | Card/map/structured detail exports retain their data definitions; no configurable table arrangement to mirror. CompactDataTable instances already export their visibleColumns. |

## Dedicated-format exceptions
Import templates and master-data transfer, sensitive-data exports, account statements, printable receipts, original evidence/photos and diagnostic import reports keep their dedicated formats. Do not rewrite these from DOM content or apply unrelated table order. No permission or financial calculation changes.

## Validation
Workbook tests reload exported XLSX and verify reordered headings, matching values, money/date/price formats, totals and embedded proof links/photos. Test unknown/duplicate/malformed column keys. 48 of 50 selected checks pass. The existing Cash Float legacy UI-source assertion and Unloading native-date-input assertion also fail on unmodified main; unrelated to export ordering. Production build passes.
