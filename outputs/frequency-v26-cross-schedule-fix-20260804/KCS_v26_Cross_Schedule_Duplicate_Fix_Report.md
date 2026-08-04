# KCS v26 Cross-Schedule Duplicate Fix Report

Generated: 2026-08-04 (Asia/Kuching)

Checkpoint: `b1b69c2544cee5f6692fe4d250df13f62a1c4b1e`

Formal database writes: **0**

## Root cause and business rule

`schedule_occurrences` was unique only by `schedule_id + planned_date`, while `dispatch_stops` was unique only by `dispatch_id + stop_sequence`. Two active schedules for one Branch could therefore each create a Stop on the same service date. Trip, material rows, and morning/afternoon are not separate collection identities in the current model; one Branch/date should have one effective Stop. A cancelled Stop is historical and does not block an audited replacement.

## Implemented protection

- Stable `branch_id` is stored on occurrences.
- New Stops store the resolved `service_date`; legacy rows are backfilled from Dispatch Day, then Dispatch date.
- Auto recurrence, exceptions, manual/API Stop creation, special requests, and Stop moves use one Branch/service-date guard across different source schedules.
- New rows use a partial unique index for concurrency safety: `branch_id + service_date`, effective rows only.
- Cancelled Stops are retained but excluded from route/driver/assignment views.
- Duplicate responses include code, existing Stop ID, existing Schedule ID, attempted Schedule ID, and service date.
- Existing conflicts are detected before route generation. No legacy Stop is silently deleted, merged, or rewritten.

## Migration behavior

The first formal-v25-shaped rehearsal exposed that the production snapshot did not yet contain `schedule_occurrences`. The migration was corrected to create that table before adding/backfilling `branch_id`. The failed attempt rolled back with the snapshot hash unchanged. The corrected v25→v26 rehearsal preserved 480 Branches, 276 Schedules, 396 Dispatches, 681 Stops, and 264 existing Weekdays; integrity remained `ok`.

The occurrence unique index is created only when occurrence conflicts are zero. The Stop partial unique index applies to newly enforced rows and therefore does not fail on legacy duplicates. Route generation stays blocked while any legacy effective Branch/date conflict remains.

## Approved 7-pair rehearsal

- DCH TECHNOLOGY: canonical Schedule 10069; superseded 10330; retain Stops 87, 380, 674; cancel/supersede 14, 312, 601.
- SK HARDWARE: canonical Schedule 10280; superseded 10317; retain Stops 16, 208, 401, 603; cancel/supersede 15, 205, 397, 602.
- All 14 Stops were draft/locked and had no documents, step records, material rows, temporary locations, weight, invoice, or completion activity.
- First isolated apply: 2 Schedules superseded, 7 Stops cancelled, 9 audit rows, 0 sequence changes, 0 completed-history changes.
- Second isolated apply: all additions/updates were 0.

## Final Legacy scope rehearsal

The snapshot contains 12 Branch/date conflict groups. Four of the five additional groups were safely added to the approved technical plan:

- DIY KBH PUNCAK BORENO (Branch 10084): 2026-07-21 Stops 115/170 and 2026-07-24 Stops 396/458; Schedules 10321/10086.
- CCK LOCAL CITY MALL (Branch 10033): 2026-07-22 Stops 200/206; Schedules 10346/10312.
- CARING FARMASI (Branch 10030): 2026-07-24 Stops 391/472; Schedules 10410/10032.

Supervisor confirmed FARLEY BAKERY collects on Wednesday only. The final fresh-copy rehearsal retained Stop 193 / Schedule 10391 and superseded Schedule 10148 plus all eight of its unexecuted locked/draft Stops: 42, 144, 240, 343, 426, 514, 572 and 629. None had business activity.

Final first apply superseded 6 Schedules, cancelled 19 Stops and wrote 25 audit rows. Second apply wrote 0 rows. All 12 legacy Branch/date conflicts and all occurrence conflicts are now zero; integrity is `ok`. The code and data plan are ready for a local checkpoint commit, but remain undeployed.

## Legitimate duplicates and cancellation

Different materials remain child rows under one Stop; different Trips do not justify duplicate Branch/date Stops. Exception rescheduling uses the target service date guard. Cancelled Stops may be replaced because the partial index and shared query exclude `status='cancelled'`. Completed Stops are never modified; if only one of a pair has business activity, it is retained with its original source schedule. If both have business activity, cleanup is blocked.
