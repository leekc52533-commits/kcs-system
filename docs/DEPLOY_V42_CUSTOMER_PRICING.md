# Schema v42 Customer pricing deployment

This deployment **requires** the reviewed v41 → v42 database migration. Never run it before reviewing the generated impact report. The production topology defaults are application `/opt/kcs-app`, systemd service `kcs-api`, and internal health `http://127.0.0.1:8787/api/health`. The public HTTPS URL is deliberately explicit and must also end in `/api/health`.

Copy as one line (replace the database path, exact 40-character reviewed target commit, exact 40-character currently deployed rollback commit, and host):

```sh
sudo env KCS_DB_PATH=/opt/kcs-app/data/kcs.sqlite KCS_TARGET_COMMIT=0123456789abcdef0123456789abcdef01234567 KCS_ROLLBACK_COMMIT=89abcdef0123456789abcdef0123456789abcdef KCS_HTTPS_HEALTH=https://dispatch.example.com/api/health bash /opt/kcs-app/scripts/deploy-v42.sh
```

Before stopping `kcs-api`, the script requires exact v41, a clean exact target (an ignored `.env.production` is preserved), a pre-existing backup directory that is already private, integrity/FK checks, a protected-data snapshot, and a migration-impact report. Any `review_required` pricing rows stop deployment. A separately reviewed JSON approval may be passed as `KCS_V42_REVIEW_OVERRIDE_FILE`; it must name every unresolved pricing ID exactly and include `schemaVersion`, `reviewedBy`, and `reason`. The script then creates and checks a SQLite `.backup`, runs the migration once, installs/builds the reviewed code, starts `kcs-api`, checks internal and public `/api/health`, and proves the protected snapshot unchanged. A failure after service stop restores the explicitly supplied known-good rollback commit and v41 backup automatically.

Do not split the command across lines, source an environment dump, or echo credentials. `.env.production` remains ignored and untouched throughout the deployment.
