# Employee Schema v20

Schema v20 adds nullable `driving_licence_expiry_date` and `gdl_expiry_date` fields to `employees`.

- `owner_admin` receives server-side `employee_manage`.
- Employee Excel/CSV template, preview, commit and export include both dates.
- Preview remains read-only. The migration imports no employee rows.
- Run `npm run migrate:v20` only against a backed-up schema v19 database.
