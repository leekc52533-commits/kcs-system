# Notice Board translations

Managers write a notice (Chinese by default; Malay and English also supported), choose recipients, and use **Translate & preview three languages**. They review and edit all three versions before explicitly publishing. Re-translate replaces only successful target translations. Editing the original source clears previous translations. Missing fields use the original notice text. Published versions, recipient snapshots, request idempotency and explicit read receipts remain immutable.

Translations are saved inside the existing `employee_notices.request_json` publication snapshot, in the same transaction as the notice and receipts. No database migration or historical backfill is required. Old notices continue to display authored text. Employee inbox, popup, history/search and management archive/export resolve saved text using `zh / ms / en`.

## Server setup

Set `OPENAI_API_KEY` in `/opt/kcs-app/.env` or the `kcs-api` systemd environment, then restart `kcs-api`. Never set it in a `VITE_` variable or commit the key. Optional `KCS_NOTICE_TRANSLATION_MODEL` defaults to `gpt-4o-mini`; it must support Responses structured outputs. The configured OpenAI account needs API access and credit. Without configuration, manual translations and original-only publication still work, with a clear notice.

The server sends the notice to OpenAI's Responses endpoint, with `store:false`, a 45-second deadline and structured JSON output. Only active management employees may request translations; one in-flight request per employee is allowed. No translation occurs when an employee reads a notice. Only source-matching master names are masked; unrelated master records and recipient lists are not sent. Master customer/branch/area/zone/employee names, registered plates/codes, uppercase internal codes and alphanumeric identifiers are masked with unique placeholders. Returned placeholders must match the source field exactly; an invalid language is discarded while valid languages survive. Managers must still review meaning and terminology before publishing.

API errors, refusal, truncation, missing or invalid output, changed protected terms and absent configuration fall back without preventing publication. No provider error body or credential is sent to the browser.

## Deployment and acceptance

1. Pull main, run `npm run build`, restart `kcs-api`, check `systemctl is-active kcs-api`.
2. Configure the server key to enable automatic translation. Test a draft containing `Serian A`, `Kuching MPKS`, `OCC`, `TN20860`, `QAV3468` and a negative instruction. Review all languages; do not publish a test notice to real employees without intending to notify them.
3. Verify language-specific text and edited translations survive publication/reload; missing translations and old notices use original text. Verify opening/changing language does not acknowledge a notice.

Automated checks: `node test/noticeBoard.test.mjs`, `node test/noticeTranslation.test.mjs`, `node test/noticeTranslationUi.test.mjs`, `npm run build`. Provider tests use a mocked response; live provider credentials and production deployment require separate verification.

Official API format reference: https://developers.openai.com/api/docs/guides/structured-outputs
