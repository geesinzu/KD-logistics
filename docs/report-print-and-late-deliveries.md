# Delivery Brief: selected print sections and late deliveries

The main `/reports` Delivery Brief now opens a section selector from **Print / Save PDF**. The default **Key details** preset includes the summary/key figures and shipments delivered after ETA. Staff can select individual sections or choose **Full report**. The report on screen remains complete.

Available sections are summary/key figures, delivered-after-ETA records, branch performance, 3PL performance, current open-shipment follow-ups, movement/stage-time analysis, and branch snapshot/actions. The print button is disabled with no sections selected or while the report is unavailable/refreshing. The phone dialog keeps its heading and print controls visible while the choices scroll.

Prints retain the KEDI logo, creation-date range, branch and 3PL scope, generation time and selected-section list. All matching rows are printed, not just the current screen page. Branch-name search does not narrow the printed branch table; the report's actual branch/partner filters still apply. Follow-up printing retains the current follow-up type and labels it in the printed header.

Browser-native printing uses the selected parts too and renders complete tables through a synchronous beforeprint update. If native printing is used after clearing every section, it falls back to Key details. Closing print dialogs restores screen pagination. Print styles suppress app navigation, injected overlays and dialog portals, override modal body scroll locks, retain repeating table headers, and allow long tables to flow without forced section-start pages.

The key-details sample with three late deliveries fits on one A4 page. This is not a promise that every selection fits on one page: long selected tables must continue onto more pages rather than drop records. Staff can uncheck the late table and print only the summary when they want a shorter output.

## Delivered after ETA

A new **Delivered after ETA** tab lists tracking ID, destination branch, 3PL, ETA, recorded delivery date and calendar days late, with the largest delays first. It supports screen pagination and CSV export, and is included in the default print preset.

It follows the existing report's 3PL completion rules:

- A date-only ETA covers that whole calendar day in Africa/Lagos. Arrival at midnight on the next Lagos date is one day late.
- Direct routes use recorded delivery; hub routes use the 3PL's arrival at the hub, with the hub noted in the row.
- Branch acknowledgement time is not substituted for missing delivery time and does not turn an on-time delivery into a late one.
- Cancelled shipments and records with missing/invalid/future delivery evidence or missing ETA are excluded from the late list. Missing evidence is not treated as zero delay or a successful on-time completion.
- The comparison uses the ETA currently recorded in the app. It does not reconstruct an original promise before rescheduling.
- As with the existing report, the selected cohort is based on shipment creation dates, with current recorded outcomes. This does not silently change to a delivery-date cohort.

CSV exports also include the recorded 3PL ETA and days delivered after ETA; eligible on-time records have zero and unknown evidence stays blank. No shipment data, permissions, notifications or database schema are changed.

## Validation

- 224 tests passed, including 17 new late-date/preset cases and the existing report-role tests. The 75 optional MySQL cases were not rerun for this read-only UI/calculation change.
- Type checking, production build, focused lint and diff checks passed.
- Browser/PDF tests: default concise preset; late-only and branch-only selection; no-selection blocking; native printing; full preset; CSV output; phone controls; no mutation requests or uncaught page errors.
- A 140-record late table printed all 140 rows across five pages; a branch table printed every branch despite its screen search. Tested PDFs had no blank pages. Synthetic local data only.
