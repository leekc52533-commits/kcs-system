# Google road-route optimization operations

KCS uses **Route Optimization API** for fleet assignment/sequencing and **Routes API** for road geometry and route metrics. It never falls back to straight-line ordering. The integration is server-side, draft-only, preview-first, revision checked, atomic, audited, cached, and guarded by a daily request limit.

## Google setup and IAM

Enable `routeoptimization.googleapis.com` and `routes.googleapis.com` in the configured Google Cloud project. The runtime service account needs the least-privilege **Route Optimization API User** role (`roles/routeoptimization.user`) and Service Usage Consumer (`roles/serviceusage.serviceUsageConsumer`). Restrict the Routes API key to the Routes API and the KCS server egress addresses. Prefer the AWS workload's existing Google federation/ADC configuration; do not place credential files in the repository.

Environment variable names are documented in `.env.example`: `KCS_GOOGLE_ROUTE_OPTIMIZATION_ENABLED`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_ROUTE_OPTIMIZATION_ACCESS_TOKEN`, `GOOGLE_ROUTES_API_KEY`, `KCS_GOOGLE_ROUTE_TIMEOUT_MS`, `KCS_GOOGLE_ROUTE_RETRY_LIMIT`, `KCS_GOOGLE_ROUTE_CACHE_TTL_SECONDS`, `KCS_GOOGLE_ROUTE_DAILY_REQUEST_LIMIT`, `KCS_GOOGLE_ROUTE_DAILY_UNIT_LIMIT`, `KCS_GOOGLE_ROUTE_MAX_STOPS`, `KCS_GOOGLE_ROUTE_CIRCUIT_FAILURES`, `KCS_GOOGLE_ROUTE_CIRCUIT_RESET_MS`, `KCS_ROUTE_DEFAULT_START_TIME`, `KCS_ROUTE_DEFAULT_END_TIME`, `KCS_GOOGLE_ROUTE_NON_PREFERRED_VEHICLE_PENALTY`, `KCS_GOOGLE_ROUTE_AVOIDED_VEHICLE_PENALTY`, `KCS_ROUTE_RULE_PROPOSAL_MIN_OVERRIDES`, `KCS_ROUTE_RULE_PROPOSAL_WINDOW_DAYS`, and `KCS_ROUTE_MAX_KEEP_TOGETHER_STOPS`. Never use `VITE_` for these values.

## Safe rollout

1. Back up the SQLite database and application artifact using the established deployment runbook. Deploy code with the feature disabled.
2. Start one instance so additive schema v43 is applied; verify `/api/status` and SQLite integrity/foreign-key checks.
3. Configure Google IAM and server-only variables. Keep the daily limit low initially.
4. Call `POST /api/dispatch/optimization/validate` against a non-production draft. This is dry-run validation and does not contact Google.
5. Enable the feature, create a preview, verify its road metrics/warnings, and apply only with a supervisor reason.

No request is made when validation fails. Google timeout, quota, authentication, incomplete response, or cost-guard failure records a failed run and leaves dispatch data unchanged. Identical valid previews reuse the cache.

## Rollback and troubleshooting

Disable `KCS_GOOGLE_ROUTE_OPTIMIZATION_ENABLED` immediately to stop requests. An applied optimization can be rolled back only while it is the immediately previous draft revision; rollback is atomic and audited. For a code rollback, disable the feature, restore the previous application artifact, and leave additive v43 tables in place. Restore a database backup only under the established incident procedure.

Diagnostics expose only enabled/configured booleans, limits, provider, and circuit state—never secrets. Check structured application errors by correlation ID. `GOOGLE_QUOTA_EXHAUSTED`, `ROUTE_COST_GUARD`, `GOOGLE_CIRCUIT_OPEN`, and timeout errors are safe failures and require a fresh preview after correction.

## Structured availability and controlled learning

The Dispatch planner availability editor stores date-specific Vehicle and Employee hours or exclusions. Structured vehicle and assigned driver/crew hours are intersected; maintenance, leave and off-duty rows remove unsafe resources. Missing structured hours are explicitly returned as `default_fallback` using the configured Malaysia-local default horizon. KCS never invents a driver assignment.

Approved keep-together rules deterministically constrain their stops to one capacity-compatible allowed Google vehicle and fail before billing on conflicts or oversize. Soft preferred/avoided vehicle rules use Google shipment `costsPerVehicle`; hard rules use `allowedVehicleIndices`. Repeated matching manual overrides only create a deduplicated proposed rule after the configured evidence threshold. A supervisor must approve it before it affects a request.

Preview cost accounting reserves optimization plus current/proposed Routes units. Savings compare only Google Routes road baselines and proposals; an unavailable baseline is labeled unavailable.
