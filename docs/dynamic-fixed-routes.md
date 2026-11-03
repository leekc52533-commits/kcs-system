# Additional fixed dispatch routes

In Vehicle Assignment & Collection Schedule → Area / Zone, use **Add route** beside
Dispatch route names. Enter a unique name (up to 60 characters). The system allocates
a new route number after all recorded routes; it does not reuse historical numbers.

In the customer editor's fixed collection schedule, select the new route and collection
weekdays, enter the normal change reason, and save. An empty route accepts its first
customer without requiring a vehicle or an existing route row. Assign the vehicle,
driver and crew on the dispatch date, then follow the existing supervisor approval.
Adding a route does not approve departure, move customers or assign a vehicle.
Existing Sunday groups remain unchanged; additional routes retain their own identity.

## Deployment

Build the frontend before restarting. Back up `/var/lib/kcs/data/kcs-dispatch.db` using
SQLite's backup API before the restart. The startup v86 migration rebuilds tables that
still contain the old `route_number BETWEEN 1 AND 5` checks. It preserves existing
columns, rows, indexes, triggers, foreign keys and AUTOINCREMENT sequence values,
checks for new foreign-key violations and commits atomically. Do not interrupt the
first startup. No historical migration files need to be run manually.

Verify the API health endpoint, create a route, confirm it appears in the dispatch
route selector and customer schedule, then assign customers and staff through the
usual workflow. A blank new route must not appear as approved. Employee visibility
continues to depend on the employee's actual assigned vehicle and date.

## Validation

`node --test test/dynamicRoutes.test.mjs test/dynamicRoutesUi.test.mjs`
checks legacy migration, first customer placement, route 6 generation, vehicle
assignment, approval and driver view, rejected unknown routes, duplicate names,
audit rollback and Chinese/Malay/English creation with draft retention.

Related regression suites were run. Three legacy failures were reproduced unchanged
on main at 6faf170: individualRouteApprovalV53 lacks driver_arrangement_requests in its
fixture; sundayDispatch lacks completion_outcome; routeEditingV52 expects an obsolete
inline rename label. These do not establish regressions in this change.

An isolated HTTP smoke check also passed: create returns 201, duplicate name 409,
route listing includes route 6, and unauthenticated creation returns 401. The test
used a temporary database and stubbed OS network-interface enumeration because
that system call is unavailable in the test container; production code was unchanged.
