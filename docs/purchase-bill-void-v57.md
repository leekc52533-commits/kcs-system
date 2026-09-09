# Purchase Bill Void — v57

Mobile: More → Bill Void. Desktop: Bill Void beside Purchase Bills.

The original issuer submits a reason. Owner/operations administrators and supervisors review pending requests; office and dispatch roles can view the records. Approval retains the bill, item price snapshots, proof file and decision history. Rejection leaves the bill and ledger unchanged. Repeating either decision is idempotent; a conflicting later decision is rejected.

Approval reverses only a matching original cash-purchase ledger deduction. It credits the original employee exactly once, even if their Cash Float account was subsequently deactivated. A missing deduction never creates a credit, and a mismatched deduction stops approval for office review. This is a ledger correction, not an external payment transfer.

The original active issuer can reissue an approved void through the same page, including for a historical completed stop. Reissue uses a new number, current eligible product prices, and a linked audit event. Cash requires a new payment proof; a failed upload retains the pending photo and allows retry. Existing proofs stay on the original bill. Completed stop/trip state is retained. If the original cash deduction exists, the issuer's Cash Float account must be active before reissue.

Schema 57 replaces the single-bill-per-stop constraint with one issued bill per stop, preserving voided bill IDs, children, ledger references and the autoincrement sequence. Migration checks foreign keys before commit. The production script requires schema 56, builds first, backs up SQLite and the frontend, restarts the API for migration, checks schema 57/integrity/foreign keys, then publishes the frontend.

Validation: 20 focused service/archive/ledger/UI tests pass; production build passes. Migration preservation and photo retention checked. Five existing billing behavior tests also pass. The pre-existing source-regex test requiring an English-only purchase UI fails unchanged on the baseline, which already implements the confirmed three-language UI. Real-phone camera and printing remain deployment acceptance checks.
