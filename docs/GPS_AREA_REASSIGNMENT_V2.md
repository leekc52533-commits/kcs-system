# GPS → Area reassignment and address assistance (v2)

## Audit baseline and scope

The work is based on merge commit `1619799a4146025feee8f147c35dd4b2db46071b` and Schema v41. The repository has no configured Git remote, so that locally available deployed merge commit was verified directly before the independent branch was created. No AWS, Lightsail, SSH, deployment service, external geocoder, production database, or production migration was used.

Audited surfaces: GPS Collector and temporary/supervisor approval, GPS data-quality queues, Zone recommendation service and UI, `areas` → `zone_groups` effective-parent hierarchy, Session permissions, generic and GPS decision audit, recommendation API routes, dispatch snapshot preservation, and the related service/UI/i18n tests.

## Root cause

The v1 no-polygon fallback selected the nearest all-Area official-GPS centroid before the nearby official Branch. It then independently selected a Zone from the winning Area/customer/Zone centre. A distant centroid could therefore manufacture a cross-Zone suggestion even when the address, a nearby official-GPS Branch, and the existing Area agreed. The UI also defaulted to every pending row and did not expose all evidence, a required review reason, or an explicit pending-GPS apply guard.

## v2 decision order and safety

1. A single polygon containment is the strongest location constraint.
2. Address and Branch-name tokens are compared with Area and parent-Zone names; postcode tokens are surfaced as evidence.
3. The nearest other Branch with Official GPS supplies confirmed Area evidence and distance.
4. Official-GPS Area centroid is explanatory supporting evidence, never sufficient on its own for cross-Zone movement.
5. The current Area is a stability signal. Without polygon containment, current-address or nearby-current agreement keeps the original Area.
6. The recommended Zone is always derived from the recommended Area's effective current parent (`confirmed_zone_group_id`, otherwise `zone_group_id`).

No polygon, outside polygon, cross-parent-Zone, missing address, disagreement between address and nearby Branch, and other conflicts force LOW/manual handling. Pending GPS is exposed as preview metadata but cannot be applied. Bulk apply requires Official GPS, HIGH confidence, no conflict, an inside-polygon result, and a target Area whose effective parent equals the recommendation.

## Workflow, audit, and preservation

Recalculation changes recommendation rows only. Ordinary recalculation retains accepted, keep-original, and selected-other decisions; an explicit selected reset is required to reopen them. Every manual decision requires a reason. The API overwrites browser actor fields with the authenticated Session identity. Apply writes one decision and one before/after audit per Branch, including GPS, reason, algorithm version, evidence, actor, and timestamp supplied by the existing tables.

The diagnostics returned with recommendation results are read-only and report legacy/effective Area-parent mismatches and stale recommendation parent mismatches. They do not repair mappings. Applying a recommendation updates only `branches.area_id`; Dispatch, Stop, Schedule, GPS, prices, and historical snapshots are neither deleted nor rewritten.

No schema migration is required; the v41 recommendation `reason_json`, decision, and audit structures hold the additional evidence and algorithm metadata.
