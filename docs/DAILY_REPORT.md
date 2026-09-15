# Daily operations report

Overview has a read-only report, with the selected business date and generation time. No daily snapshots or financial adjustments are written. Reading occurs in one SQLite read transaction. Changes use Asia/Kuching operation dates, including updates affecting earlier business dates.

## Access

The account pinned in company_menu.owner_account_id defaults to full access. Other desktop management roles receive operational data only. The owner can grant daily_report_full or daily_report_finance in Employee & Account. Only the pinned owner may change these grants; ordinary owner-role membership is insufficient. Existing account-management checks still apply. Grants do not permit edits, approvals, employee identity/payroll access or driver desktop access. Financial fields and unrestricted audit snapshots are omitted server-side for operational viewers.

## Counting

- Purchase totals sum issued bill headers exactly once. Product/unit quantities sum issued bill items. Only kg units contribute to weight/target comparison. Voided bills appear separately, excluded from effective totals.
- Vehicles count started trips or issued purchase evidence. Trip count uses started trips. Planned-but-unstarted vehicles remain distinguishable in details.
- Branch counts are distinct branch IDs, not bills or stop visits. Collected means an issued bill exists. No Goods includes both no_goods and no_goods_notice. Pending excludes cancelled/superseded/completed stops. A branch with multiple visits can appear in more than one outcome category; categories must not be added as a partition of unique branches.
- The editable 2,000 kg/day target is explicitly a report reference only; it does not change persisted dispatch configuration. Per-vehicle details show the comparison.
- Expenses combine employee expense transactions and admin expenses once, excluding voided transactions. Float top-ups are separate and are never added to expenses or purchases.
- Sales totals use settlement dates. Delivery details select recorded settlement lines by delivery date; delivery weight is not an assertion that all delivered loads have received settlement. Settlement is not payment confirmation. Unrecorded payments are marked as such, never inferred.
- Formal customer/branch creation excludes temporary intake source records. Formal intake decisions are included on their review date. Temporary intakes remain a separate creation count.
- Reschedules use saved schedule exceptions plus approved date requests; distinct branch counts prevent duplicate requests from multiplying customer counts. Audit entries remain available separately for manual changes not represented by those sources.
- Approvals include date/defer/arrangement/transfer, financial corrections for full viewers, temporary customer decisions, GPS reviews and route approval/withdrawal history. Pending is the current pending queue created on or before the selected date, not a reconstructed historical pending queue.
- History is derived from named existing business audit tables. Missing tables are explicitly listed. Old unlogged actions cannot be reconstructed. Duplicate audit entries may reflect the same business action and are not advertised as unique actions. Sensitive employee values, credentials and evidence paths are removed.

## UI and verification

English, Bahasa Melayu and Chinese labels; official names preserved. Expand rows for detail, use shared column search/multi-select/blank/sort controls, and explicitly save column order in this browser. Failed/superseded requests cannot display stale totals as a newly selected day.

Tests: date boundaries, bill/item duplication, voids, units, distinct branches, expenses vs top-ups, finance access/revocation, owner-only grants, delivery vs settlement dates, reviewed target dates, three-language rendering, column order and stale request rejection. Deployment runs the builder read-only against the production schema before restarting; backups, health and integrity gates remain in place. No real-browser visual QA was available in the development environment.
