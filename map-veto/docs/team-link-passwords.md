# Separate team-link passwords

Keep the existing **Password** column. Enter a value on **each team's row**:

| Names | MapVETO Match ID | Format | Password |
| --- | --- | --- | --- |
| Fnatic | D1-M01 | BO3 | example-A-0042 |
| Sentinels | | | example-B-0071 |

These are examples, not production passwords. Passwords are case-sensitive;
leading zeros are preserved. Both values must be 4–128 characters, without
leading/trailing spaces or control characters. Missing or invalid values block
creation for that pairing. Waiting matches also need both values before approval.

The first row's password belongs to the first team's link; the second row's
password belongs to the second team's link. Winning the toss and choosing the
opposite veto position does not swap passwords between links. Password values
never appear in the import preview, match data, action log or database snapshots.
Only separate salted hashes are stored in the service-only password table.

Existing matches with a shared password remain accessible using that password.
To adopt two passwords, enter both values in the sheet, refresh its preview and
have a Head Admin approve the new team passwords. A sheet edit or background sync
never silently replaces passwords on a created match. Approval invalidates both
teams' current sessions; each must then enter its own password. Staff and observer
links keep their existing access rules. Unprotected matches stay unprotected.

The additive migration keeps `password_hash` for the original first-team link and
adds `team_b_password_hash` for the second. A null second hash denotes legacy
shared protection. Apply the migration to VG Veto before deploying the application;
do not apply this change to the EMEA archive. Fresh-install and regression loaders
include both numbered historical and timestamped migrations.

Verification: parser validation and plaintext omission, SQL import/replacement
and access restrictions, legacy shared passwords, cross-team password denial,
per-link attempt limits, scoped sessions, position swaps and protected map actions.
