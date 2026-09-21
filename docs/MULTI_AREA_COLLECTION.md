# Date-specific multi-area collection

In Dispatch & Collection → Weekly Dispatch, select the date and open **One vehicle · multiple areas** (一车负责多个区域).

1. Assign an available vehicle to the receiving route. Set its driver and attendants once using the existing vehicle controls.
2. Withdraw departure approval if necessary. Select the receiving route/vehicle, tick the other daily routes, enter a reason and save.
3. Review the receiving route's full customer list and approve it for departure. Employees refresh Today to see all assigned areas and customers.

This moves existing stops into the receiving daily execution route; it does not copy customer records or permanently combine geographic areas or recurring routes. Other selected route cards become empty for this date. Original area labels remain visible in the employee list. Open areas retain their flexible priority behavior; closed areas retain ordinary order and approval checks.

Already started work, arrived/completed stops, payment/bill/evidence records, unloading records and pending customer requests block the operation. Resolve pending requests first. For an already running vehicle, use the existing supervisor push action for open areas. The entire merge is transactional and checks the displayed day revision. Before assignments, crew and stops are saved in the dispatch audit.

No schema change (75). Use the existing staged backup/deployment script `scripts/apply-attendance-production.sh` with the new commit as EXPECTED_COMMIT and the currently installed commit as PREVIOUS_COMMIT. This script backs up the database and frontend and verifies service/public health.

Validation: multi-route service and three-language UI tests; existing driver access, route adjustment and individual-approval tests; production frontend build. Two pre-existing assertions in mobileTomorrowRoute.test.mjs also fail on the pre-change baseline (old draft-visibility expectation and old No Goods markup assertion); this change does not alter those behaviors.
