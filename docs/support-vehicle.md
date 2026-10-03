# Add support vehicle

Expand a route on Dispatch & Collection Schedule, click Add support vehicle, choose a spare vehicle, driver, up to two attendants and customers, then confirm. Only the selected date changes. Original customer rows move atomically, without copying stops or editing recurrence. At least one customer remains on the original vehicle.

The new route displays the source route name plus a translated support badge and its own vehicle/count/approval controls. Approve it before departure. If the source has not departed, review and approve it again. For a running source, only untouched stops can move; its validated remaining approval is retained and audited. Other route approvals are unchanged by the operation.

The existing dispatch engine has five independent daily route slots. Support uses an empty slot, including the slots freed by Sunday grouping or area combination. A full five-route day returns a translated capacity message; this change does not introduce a sixth route. Source routes with only one customer use existing whole-route reassignment instead.

Checks include management access, revision, available date-specific vehicle, no existing vehicle work, active eligible staff, approved leave, employee availability, staff overlap, distinct driver/crew, source customer lifecycle, execution/document evidence and pending requests (including GPS approval). Save is one transaction; stale retries cannot create duplicate assignments. Support vehicle/driver choices are excluded from future default inheritance. Regeneration preserves same-date split stops, and later Sundays keep the fixed schedule.

Tests: supportVehicle.test.mjs, supportVehicleSunday.test.mjs, supportVehicleUi.test.mjs, combineDayRoutes.test.mjs; npm run build. Existing combination tests now initialize the arrangement-request schema used by their production guards.

Deploy: pull main, npm run build, restart kcs-api, verify active. No new schema migration is needed. Check 04/10/2026 with an intentionally selected spare vehicle and staff; saving assigns actual work, so do not submit a test assignment in production unless intended.

## Multi-route selection

The panel now groups customers from all routes on the selected date. Select from several groups in one operation; each group shows remaining and selected counts. Each affected original route must retain at least one customer. The resulting support route carries all selected stops and labels all source routes, while its audit saves `sourceRouteNumbers` (legacy single-source entries remain readable). Approval invalidation/preservation is evaluated separately for every affected source. A protected or stale stop anywhere rejects the entire operation. Also corrected a stray support-only guard in the generic manual-stop creation path; the multi-route fixture exercises that path.

## Day toolbar and other customers

The sole Add Support Vehicle entry is beside Combine Areas. The day-level POST `/api/dispatch/day/:date/support` accepts existing `stopIds` and optional internal `branchIds`; legacy route-scoped POST remains compatible. GET `/api/dispatch/day/:date/support-customers` requires dispatch management access and returns active branches without a non-cancelled task on the selected date, plus live fixed route names/memberships. Effective home-route settings take precedence over weekly-plan memberships.

The Other Customers panel combines case-insensitive customer/branch/code/route-name search with a fixed-route selector, includes an unassigned-route option and retains selected customers across filters. Save revalidates the complete selection. Extra customers get one-date dispatch stops inside the same transaction as transferred stops and staff; no recurring schedule is created or edited. An other-only support route is supported and explicitly marked as support even without source daily routes. Existing five-slot capacity remains.
