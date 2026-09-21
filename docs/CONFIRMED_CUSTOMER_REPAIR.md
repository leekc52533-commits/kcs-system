# Confirmed duplicate repair — 2026-09-21

Canonical branches/customers:
- B10507 and B10503 → B10500; C10279 and C10283 → C10039.
- B10508 → B10107; C10284 → C10041.
- B10509 → B10165; C10285 → C10056.
- B10506 → B10495 HARI-HARI MTG, under C10272 HARI-HARI. No unconfirmed source customer is retired for this last pair.

Run `node scripts/reconcile-confirmed-customers-20260921.mjs DATABASE` for a transactional preview, or add `--apply` to back up and apply. All identifiers are resolved uniquely with optional B/C prefixes. Canonical branches must belong to the confirmed active customer. Conflicting replacements, unexpected active sibling branches and unfinished source stops stop the entire operation without partial master changes. Repeated application does not duplicate audits.

Duplicate branches become DUPLICATE_REPLACED and point to the retained branch through the existing replaced_by_branch_id field; their recurring schedules are disabled. Specified duplicate customers are retired with immutable before/after audit and canonical customer code. Original bills, payment proofs, executed stops, GPS and pricing history remain unchanged under their original IDs. This is archival canonical linking, not rewriting issued bills or moving historical amounts onto another original issuer/customer. Original records remain available for historical lookup.

Mobile intake now defaults to Existing customer collection. Search covers active masters regardless of today's schedule and shows customer/branch IDs. No successful selection means no existing-customer submission. New customer is available only after no-match search plus explicit confirmation; the backend also rejects an existing matching master on new intake/request creation. Searches of retired branch aliases resolve to the canonical active branch. Existing vehicle transfer, approval, live GPS and billing guards remain.

Deploy via the existing schema-76 route deployment script, then run the repair with the production DB path. No schema change is introduced. Production data has not been inspected locally; apply output is the evidence of actual completion.
