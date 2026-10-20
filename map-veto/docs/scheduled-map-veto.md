# Scheduled MapVETO check-in

Use a **MapVETO Time** column with the full wall-clock date and time:

**YYYY-MM-DD HH:mm**, e.g. **2026-10-24 18:00**.

Every value means **GMT+3 / UTC+03:00**, independent of the organizer's browser or the server timezone. In Google Sheets use Plain text, or a custom date/time display of `yyyy-mm-dd hh:mm`, so the formatted value read by the website matches this format. A time alone cannot identify the calendar day and is flagged for correction. A blank cell means no schedule. Put one value on the first team row; if both rows contain a value, they must agree.

The creation preview shows the sheet value and an editable date/time field labeled GMT+3. Head Admins may override it or select Use no schedule. Explicit overrides are saved with approved waiting fixtures so background sync uses the same decision when the opponents resolve. Already created matches keep their original schedule; sync never silently changes it. Past-deadline creation requires an extra warning confirmation.

For scheduled matches:

- Check-in is unavailable before the scheduled time. Team links display the opening and ten-minute deadline using the synchronized server clock.
- Teams checked in before the deadline may begin immediately once both are ready.
- At the ten-minute deadline, one absent team's remaining selections, including its position choice, are randomized automatically. The present team keeps its normal turns. Late arrival does not remove the restriction.
- With both teams absent, the first three maps (five for BO5; one for BO1) from that match's actual map pool, sorted alphabetically, become the ordered results. Starting sides are randomized independently. Team A is the reference for the stored starting side.
- “Restart entire veto” clears the schedule and no-show enforcement and returns both teams to ordinary check-in. A later sheet sync cannot re-arm the old schedule.
- The existing one-second database scheduler enforces deadlines without connected browsers. Check-in, selections, scheduler processing and resets share the state row lock. Repeated processing does not apply the no-show rule twice.

Existing unscheduled matches remain unchanged. No additional polling or client dependencies are introduced; the ready screen uses a local clock tick while open. Deadline decisions are server-side, not based on a player's clock.

Validation: `node tests/scheduled-veto.test.mjs` covers strict date parsing, fixed GMT+3 conversion, opening enforcement, BO1/BO3/BO5 defaults, one-team automation, absent coin winner, late access, reset, idempotency, importer override persistence, background waiting creation and service-only RPC permissions. The existing veto engine suite covers normal play, timeout clocks, overrides, role swaps and import/password regression behavior.
