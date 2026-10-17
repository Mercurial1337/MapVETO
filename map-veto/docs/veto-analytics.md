# Event veto analytics

Open Events → Veto analytics for an event. Available to its owner, Head Admins and Referees after signing in. Team, observer and match referee links do not grant event dashboard access.

Three views: map overview, team profile (including ten recent vetoes), and a two-team comparison. Filter by BO1/BO3/BO5, imported day tab and imported round. Day/round reflect the source at creation; manually created matches have no day/round label and appear under All days / All rounds.

Only matches marked completed with a complete current state contribute. Cancelled and unfinished vetoes are excluded. Reset/reopened actions are excluded by reading the current state rather than the audit log. Team names are matched within this event ignoring case and repeated spaces; different names are not automatically treated as aliases.

- Picks and deciders are separate. A system decider counts once for the event and appears in both participating teams' profiles.
- Pick/ban/decider rates use the number of completed vetoes where that map was available. This handles changes to the map pool.
- First bans count each team's first ban in a veto. An event has up to two first bans per veto.
- Attack/defense counts measure the side chooser's preference, not match results or the opponent's inferred side. Older selections without a recorded chooser are excluded from side counts.
- Saved selection actors identify the original team links, regardless of their chosen A/B veto position.
- Automatic selections remain part of the final veto preferences, without a separate automatic-selection metric.

No progress, timing, operations KPIs or win rates. No new dependencies, chart libraries, polling, database tables or migrations. Analytics loads only on its own page; navigating between views and choosing teams uses the already aggregated response. Refresh and filter changes read from the server. The private endpoint checks event membership before using service access, paginates completed matches by ID and returns only aggregates and bounded history. Credentials, raw sheet snapshots, passwords and link tokens are never returned.

Checks:

```text
node tests/analytics.test.mjs
node --env-file=.env.vgveto.local tests/analytics-http.test.mjs
```

The HTTP test uses TEST_APP_URL (default http://localhost:3001), creates disposable users/events/matches, checks pagination, authorization and filters, then deletes its fixtures.
