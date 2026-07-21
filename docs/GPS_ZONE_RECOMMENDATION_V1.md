# GPS-Based Zone Recommendation V1

## Safety boundary

The recommendation engine reads only `branches.latitude` and `branches.longitude` as official GPS. Records in `temporary_locations` are intentionally excluded until a supervisor explicitly adopts one as official GPS. Calculation never writes `branches.area_id`, `areas.zone_group_id`, GPS fields, schedules, or dispatch history.

Formal assignment changes happen only through a supervisor decision. Every decision stores the old/new Area, old/new Zone, official GPS, calculation reason, actor, and timestamp.

## Database schema

Schema v13 adds:

- `zone_boundaries`: immutable versions of a Zone polygon or center, effective date, and active state.
- `gps_zone_recommendations`: latest calculated recommendation per Branch, including official GPS snapshot, confidence, conflict status, suggested Area/Zone, distance, reason, and review status.
- `gps_zone_decisions`: append-only supervisor decision history.

`dispatch_stops.zone_group_name_snapshot` and `area_name_snapshot` remain unchanged. Old routes therefore continue displaying the Area and Zone used when that stop was created.

## Calculation order

1. Reject missing or invalid official GPS. A temporary GPS is reported as ignored and is never substituted.
2. Test the official GPS against every active, effective Zone polygon.
3. One polygon interior match produces a High confidence Zone recommendation.
4. A point on a boundary produces Medium confidence and requires review.
5. Multiple polygon matches produce `boundary_conflict`; no Zone is automatically selected.
6. A point outside every polygon returns the nearest polygon boundary and approximate distance with Low confidence.
7. Without usable polygons, the engine compares multiple available signals: nearest official-GPS Branch, nearest Area GPS centroid, and nearest configured Zone center.

Haversine/segment distance is an approximation. V1 does not contain a road-distance matrix, so it never labels these values as driving distance. A future distance-matrix provider can be added as another signal without replacing polygon precedence.

## Boundary management

Open `GPS Zone 建议` → `Zone Boundary Map`:

1. Select an active Zone Group.
2. Choose “绘制新边界”, then click the map in polygon order; or choose “修改当前边界” to copy the active version into a draft.
3. Undo or remove individual points as needed.
4. Optionally enter a Zone center and effective date.
5. Save a new version. The previous version becomes historical and recommendations are recalculated.

The side panel lists polygon overlaps, official-GPS Branches not covered by any polygon, draft points, and boundary version history. Shared borders alone are not treated as polygon-area overlap, while a Branch exactly on a shared border can still be flagged for supervisor review.

## Supervisor recommendation workflow

The confirmation view supports search, status/confidence filters, conflict-only view, and the following actions:

- Accept recommendation: change the Branch to the suggested existing Area.
- Keep original: retain the current Area/Zone.
- Select another Zone/Area: choose an existing Area belonging to the selected confirmed Zone.
- Later: leave the recommendation for future review.
- Batch High: explicitly accept only pending High-confidence, non-conflict recommendations that already have a suggested Area.

Zone is derived from the selected Area's confirmed Zone. The system never moves an entire Area merely to satisfy one Branch recommendation and never binds a Zone to a vehicle or driver.

## API

- `GET /api/zone-boundaries?history=true`
- `POST /api/zone-groups/:id/boundaries`
- `GET /api/gps-zone-recommendations`
- `POST /api/gps-zone-recommendations/recalculate`
- `POST /api/gps-zone-recommendations/:id/decision`
- `POST /api/gps-zone-recommendations/bulk-confirm-high`

Decision payload examples:

```json
{ "action": "accept", "confirmedBy": "Supervisor" }
```

```json
{ "action": "select_other", "zoneGroupId": 2, "areaId": 15, "confirmedBy": "Supervisor" }
```

Supported actions are `accept`, `keep_original`, `select_other`, and `later`.
