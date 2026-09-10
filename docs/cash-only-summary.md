# Employee cash-only summary

Supersedes the mixed cash/credit summary in cash-overview.md. Summary purchase and void totals now both filter payment_method=Cash. Credit is excluded and no longer displayed. Employee Expense is grouped into actual category lines across all employees in the selected period, with Other grouped by description. Shared grouping preserves consistency with individual daily cards. Admin Expense and topups remain excluded. Integer-cent total equals gross cash purchases plus expense items minus voided cash bills (by original bill date).

No changes to employee balances, postings, schema 61 or individual day scope. Three tests and build passed, covering issued/voided credit exclusion, expense grouping, total reconciliation and rendered three-language summary. Deployment script backs up database/frontend and checks health/integrity.
