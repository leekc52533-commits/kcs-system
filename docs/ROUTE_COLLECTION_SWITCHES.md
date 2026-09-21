# Whole-route flexible collection (schema 76)

The pinned menu owner controls Open / Close on each card under Weekly Dispatch → Dispatch (also visible in the Route view). No expiry: the five settings follow route numbers across dates and vehicle changes. Renaming routes preserves their settings. Other accounts receive no switch controls and cannot write settings.

The geographic Zone page no longer has collection switches. Old PATCH /api/collection-access/:id requests return 410; the new route API uses /api/route-collection-access. Supervisor push is a collapsed section in dispatch and lists customers from the selected open route and currently running target vehicles.

Actual day membership determines permission. Unscheduled branches require all active master-route mappings to be open; unmapped branches stay closed. A transferred claim retains its source route's permission. Closing blocks priority execution for untouched claims; already-arrived claims retain the existing completion safeguards. Departure approval, GPS, pending requests, payment proofs, uniqueness and audit remain required.

Migration retains old zone settings/events as history, copies only fully open mapped routes and leaves partial/unmapped routes closed. Review the five controls after deployment. Existing stop/bill/payment data is not rewritten. Migration is transactional and repeatable.

Deploy with scripts/apply-route-collection-production.sh and EXPECTED_COMMIT / PREVIOUS_COMMIT. It stages the frontend, backs up the SQLite database and frontend, upgrades to 76, checks service and public health, and restores previous code/frontend on failure without discarding newly recorded data.

Validated: route owner permissions, revisions, no expiry, source-route claims onto closed destination routes, closing/arrived behavior, pending requests/Cash safeguards, migration including partial scopes/idempotency, three-language UI and multi-area route merge. Production frontend build and shell syntax checks pass.
