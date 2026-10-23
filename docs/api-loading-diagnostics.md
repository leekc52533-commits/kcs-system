# API timing and planner loading protection — 23-Oct-26

API requests except health checks now log api_request_started with requestId, method and path before handler execution. Completion/disconnection logs include durationMs, phase and status; requests taking at least 5000 ms use api_request_slow. An asynchronous pending request also emits a warning after 5000 ms. Query strings, headers and bodies are omitted.

Important limitation: synchronous SQLite work blocks Node timers too. The pending warning cannot run during that blockage; the earlier start entry still identifies an in-flight request, and completion records duration if the request returns. Timing is diagnostic, not automatic cancellation or a watchdog.

The dispatch planner has one active load per mounted page. Interval/focus refreshes do not overlap and hidden pages skip interval refresh. Explicit saved-edit refreshes queue at most one trailing load. A failure pauses background refresh and shows a translated inline error and Retry button. Previously loaded data is labelled as potentially stale. After 30 seconds the browser aborts waiting and shows a timeout warning; server processing may continue, so there is no automatic retry after timeout. Date changes discard stale results.

Scope: planner data loading only, not every API call or mutation across the app. Existing mutation protections remain unchanged. Request timing applies across the API.

Validation: requestTiming, requestWithTimeout and plannerLoadingUi tests cover correlation/privacy, slow/disconnected requests, transport timeout and abort, request coalescing, failure pause and explicit retry. Production frontend build passes.

Deployment requires npm run build and restarting kcs-api. Check planner loading and /api/health after deployment. Use journalctl -u kcs-api and match requestId between api_request_started, api_request_finished/api_request_slow and api_error. Additional per-request metadata increases journal volume; normal system journal retention applies.
