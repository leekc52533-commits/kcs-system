# Unlocked daily cash history

Daily records are live aggregates of existing persisted bills and Employee Expense, not frozen snapshots or a scheduled close. Month selector includes zero days; clicking a date loads that day in the existing cash-only/category summary. Past and future selectors do not change employee-card today scope. Credit, Admin Expense and topups remain excluded.

At Asia/Kuching midnight, today's single-day filter advances. Manually selected historical ranges remain in place. Focus/visibility events catch up after phone sleep. Today's cards reload on date changes. Latest request wins to prevent old responses replacing a newer selected date.

Office Expense form already accepts service date; validate real dates and reject future Employee Expense dates. Mobile endpoint explicitly disallows backdating before proof storage. Existing transaction created_at and actor fields preserve actual entry history; ledger now displays entered time beside the actor, distinct from service date. Backdated expenses update the original daily total and all later computed opening balances without posting twice. No old-bill editing, owner-transfer or new driver permissions.

Schema 61 unchanged. Validation covers midnight boundary, historical filter preservation, leap months, late-entry recomputation, credit/void rules, unauthorized past-date rejection, and rendered month/date navigation in all languages. Deploy with apply-cash-daily-records-production.sh and EXPECTED_COMMIT (backup/build/restart/health).
