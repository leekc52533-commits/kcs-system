# Daily report corrections — 20-Oct-26

- Decisions today: server builds one decision-date result using SQLite's UTC/+08-aware conversion to Kuching calendar date. Both count and drill-down use it. Previously the UI compared an en-GB display date against an ISO date, removing valid rows.
- Changed branches: group resolved branch/dispatch-stop/branch-schedule events by branch and show its name, branch code and individual change payloads. Previously this summary opened all business audit events, including unrelated IDs. Historical 67/66/68 identities require production evidence; they are not assumed to be branch IDs.
- Schedule sync cancellations: localized explanation plus recorded cancellation time, actor and source schedule ID. No historical records or scheduling decisions rewritten. The exact causes for DIY BKW, DIY KST KUCHING SENTRAL and ECO QKS KUCHING SENTRAL remain unverified.

Read-only evidence command after pulling this revision:

```sh
sudo node scripts/inspect-daily-report-issues.mjs /var/lib/kcs/data/kcs-dispatch.db 2026-10-19
```

The script opens SQLite read-only without application startup or migrations. Current schedule values are explicitly labelled as current, not historical evidence. Review cancellation logs and the preceding schedule history to establish each cause.

Verification: dailyReport backend and UI tests, including timezone boundaries, branch grouping and summary drill-down selection; Vite production build.

Follow-up: confirmed the public JavaScript bundle already contained the updated branch/decision drill-down mappings. General audit rows still used bare identifiers for non-branch entities. Resolve declared route, vehicle, trip, day and cargo-batch records, retaining each audit event and its typed reference. Missing relationships use a labelled record reference, never guessed branch names. Backend/UI regression suite: 18 tests passing; production build passes.
