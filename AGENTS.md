# KCS Dispatch System — confirmed standing requirements

These requirements were confirmed by KC on 2026-09-09. Carry them forward for later work.

- Before implementing a new system change, restate the requested behavior in plain Chinese and wait for KC to confirm the interpretation. After confirmation, proceed with that scope without asking again. The supervisor overview and desktop/mobile language work in this change are already confirmed.
- Supervisors enter the management interface at Overview (总览), not the last-used dispatch page. Keep normal navigation usable after entry.
- Desktop and employee mobile interfaces must support complete English, Bahasa Melayu and Chinese. The selected language applies to pages, cards, buttons, dropdown labels/options, dialogs, tooltips, validation/errors and success notices. Translate display labels, never API enum values or stored business data.
- Preserve official customer, branch, employee, vehicle, route, area and place names. Address/place data remains in English or Bahasa Melayu; do not translate it into Chinese.
- Data-backed dropdowns must read current master records instead of hard-coded option lists. New saved routes, customers, branches, vehicles, staff and areas appear in relevant selectors, subject to permissions and eligibility. Renames refresh the display. Inactive records are unavailable for new assignments while historical references remain intact.
- This document records development requirements, not a claim that every legacy screen already complies. When changing a screen, verify its affected controls against these rules and report remaining limitations honestly.

- All existing and future photo entry points must use the shared in-page camera: live capture, preview before explicit submission, retake/remove, gallery selection, compression, and retained pending photos on upload failure. Camera buttons and notices support en/ms/zh. Preserve PDF document uploads alongside photo controls. This applies to mobile/office expenses, GPS, weighing, payment/No Goods proofs, employee documents and vehicle records. KC confirmed this scope on 2026-09-09.
