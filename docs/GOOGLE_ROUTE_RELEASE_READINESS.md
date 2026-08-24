# Google route optimization release-readiness correction

## Full-suite failure investigation

The first feature run had 21 failures. Nine were caused by the feature and are corrected:

- `addressAnalysisV42.test.mjs:42`, `areaRefinementV39.test.mjs:23`, `compactMasterLists.test.mjs:19`, `customerLevelPricing.test.mjs:24`, `defaultVehicleV36.test.mjs:23`, `dispatchCommercialV35.test.mjs:22`, `operationalLocationCompanyYard.test.mjs:10`, and `prelaunchFixes.test.mjs:139` asserted the application-wide `SCHEMA_VERSION` was 42. Only that exact assertion now expects 43; tests of the v42 migration itself still expect migration result 42.
- `deployV42Execution.test.mjs:30` exposed an introduced startup regression: `database.mjs` attempted v43 directly against a v41 deployment rehearsal. Startup no longer performs the explicit production migration. Fresh schema SQL contains the additive v43 tables, while existing v42 databases use `npm run migrate:v43`.

The remaining twelve failures reproduce unchanged at base commit `2acfa0c0aa1507dbef61f175b2c2cb598ee28997` (base targeted run: 70 tests, 58 pass, 12 fail; corrected feature full run: 652 tests, 640 pass, the same 12 fail):

- `customerBranchRepair20260803.test.mjs:11` and `:12`: the script test double does not implement `db.serialize` (`TypeError`), before feature code loads.
- `i18nRender.test.mjs:72`, `:109`, `:149`, and `:190`: existing render/source contracts disagree with current base UI wording/placeholders and the consolidated Vehicle Back-button condition.
- `i18nV19.test.mjs:146`: existing raw-value source assertion expects `item.locationName`, absent on base.
- `interactiveFeedbackUi.test.mjs:40`: existing shared responsive/reduced-motion CSS source assertion fails on base.
- `occPriceGroupsV23.test.mjs:36`: existing OCC source assertion rejects a confirmation pattern already present on base.
- `sevenDayDraftPreview.test.mjs:27`: existing fixture expects two created stops but base creates three; `:66` expects an older empty-state object shape that predates Buyer and End Location fields.
- `uiCloseout.test.mjs:8`: existing source assertion expects one Branch editor logo match while base contains two.

These unrelated tests and application areas were deliberately not weakened or rewritten.
