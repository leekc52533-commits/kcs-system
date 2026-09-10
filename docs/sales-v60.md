# Sales settlement records (schema 60)

Management-only Sales navigation beside Expenses. Office, supervisor and administrators may create and correct records; driver/crew APIs and navigation are excluded. Reuses the archive toolbar, same-row date range, checkbox/blank/sort column menus, photo picker and viewport-bottom scroll. Date range filters settlement date; each row preserves its separate delivery date.

Store factory/vehicle IDs with historical labels, settlement number, per-slip date/material/kg/unit price/amount, rounding, total, original photo and audit revisions. Same factory+normalized number is unique. Save checks per-line multiplication and aggregate total and requires photo-review confirmation. Existing photos remain during corrections; stale revisions cannot overwrite newer edits. Multiple prices are supported. No cash receipt, deduction or raw weighing claim is inferred.

OCR uses local Tesseract on the photo plus a temporary enlarged/deskewed copy. Original image is retained unchanged. It matches master records, fills empty header fields and an empty line table, and never automatically saves. The supplied tilted photos produce partial/inaccurate recognition, so missing data, wrong numbers and totals must be reviewed. Totals and multiplication catch many but not all recognition errors. OCR failure leaves manual entry and photo available. Deployment installs Tesseract English and ImageMagick if absent.

Excel exports the filtered/sorted line records and one photo per included settlement. Current shared uploader produces JPEG; PNG also embeds. Other image types link to the original. Settlement totals repeat on line rows and must not be summed as line amounts.

Migration adds settlement and audit tables only (59→60). Deployment backs up database/frontend, builds, migrates on API restart, then checks schema/integrity/health. Automated service/UI tests cover access, duplicate/stale guards, arithmetic, rollback, OCR parsing, three languages, migration and filtered export. Actual phone capture and production OCR are to be verified after deployment.
