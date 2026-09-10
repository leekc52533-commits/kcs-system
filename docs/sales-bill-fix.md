# Sales bill header recognition

Sales uses Bill terminology in English and bil in Malay, including export/photo/error labels. Stored field names and schema 60 remain unchanged.

When whole-page OCR misses the CP number, a bounded fallback reads the upper-right CASH PURCHASE header at a normalized width, locates the number token, closes dot-matrix gaps, and reads the isolated line with a restricted character set. A recovered date-coded CP number must match the independently read bill date. No missing digits are inferred. Other factory layouts retain existing OCR and manual review. Original photos and manual edits are preserved.

Regression: run salesOrientation, sales and salesUi tests with KCS_SALES_BILL_FIXTURE pointing to the original private QM630S image. Do not commit private customer photos. The real-image regression checks CP-2026091028 and 2026-09-10. Other fields still require review; this is not a general OCR accuracy guarantee.

Deploy using scripts/apply-sales-bill-production.sh with EXPECTED_COMMIT. It backs up the DB/frontend, builds, restarts and checks integrity and health.
