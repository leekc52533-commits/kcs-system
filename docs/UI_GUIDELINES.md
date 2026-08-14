# KCS UI Guidelines

For screens with many business records, use a compact table or list with clear rows and columns, search, filters, sorting, a per-user column chooser, and expandable details. Keep primary identifiers and essential actions visible. Use cards mainly for KPIs, summaries, warnings, and a small number of important states—not for dozens or hundreds of records.

- Single-action and single-select menus close immediately after a choice. Multi-select filters and column choosers stay open until the user closes them or clicks outside.
- Copy controls appear only where copying has a practical operational purpose (for example phone, GPS coordinates, username, and identifiers in details). Do not add a copy icon to every ID in dense list rows.
- Toolbars use compact icon-and-text actions. Format choices such as XLSX and CSV belong in a small menu rather than separate large buttons.
- Detailed fields belong in expandable rows or detail views instead of being spread across the main list.
- Interactive elements retain pointer, hover, focus-visible, and pressed feedback. Read-only content must not appear interactive.
- Mobile layouts must avoid page-level horizontal overflow. A wide data table may use its own contained horizontal scroll.
