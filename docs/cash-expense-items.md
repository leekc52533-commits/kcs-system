# Cash Float expense items

Employee daily arithmetic replaces the combined expense row with actual categories. Same-day, same-employee categories aggregate in cents; Other groups by trimmed description, displayed as raw user text. Missing historic details fall back to known category descriptions or Other. Empty/zero groups are omitted; signed entries preserve reconciliation with the existing ledger and separately displayed reversals. Company spending summary and posting rules are unchanged. Schema 61.

Validation: 3 tests passed for reconciliation, category grouping, distinct Other descriptions, day/employee isolation and three-language rendered cards. Production build passed. Deployment script backs up DB/frontend and verifies health/integrity.
