# Cash Float overview

Unified inline toolbar with date range and export, daily employee arithmetic cards, suggested top-up outside More. Target, threshold, Add Expense and Settings move into More. Bottom ledger scrollbar retained through shared component.

Employee cards always show today in Asia/Kuching: balance before today + topups - cash purchases - expenses + other signed entries = balance through today. Initial setup, refunds and adjustments are included explicitly. Target is not opening balance. Suggested topup is max(0,target - closing balance).

Top summary defaults to today; selected date range aggregates all purchase bills (gross minus voided bills) plus nonvoided Employee Expense. Credit purchases are separately disclosed, not treated as payment proof. No Admin Expense or topups. Void adjustments use original bill service date, not void approval date. Hidden/retired cards and 2000-row ledger limit do not exclude transactions from totals. No database or posting changes; schema 61.

Validation: integer-cent reconciliation, future-date exclusion, credit/void accounting, admin/topup exclusion, 2001+ rows, rendered three-language cards, build. Deployment script backs up DB and frontend and checks health/integrity.
