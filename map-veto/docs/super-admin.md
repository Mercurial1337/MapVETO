# Super admin account

One account, `superadmin@vg.com`, can only create platform accounts. It has no other access: every other admin page redirects it to Accounts, and every staff API (events, matches, sheets, staff, analytics, exports, notifications, match administration) returns 403 to it. It cannot list accounts or tournaments, assign staff or reset passwords. It is marked by `app_metadata.role = "super_admin"`, which only the service role can write; the email alone grants nothing.

## Setup

`node scripts/create-super-admin.mjs` with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set:

- creates the account (email confirmed) with a generated password printed once, or with `SUPER_ADMIN_PASSWORD` if given;
- on an existing account, sets the role and keeps the password unless `SUPER_ADMIN_PASSWORD` is given;
- removes the role from any other account, so there is only ever one super admin.

## Admin → Accounts

Visible in the sidebar for the super admin only. The page has one form: email and an optional password (at least 10 characters; otherwise a 24-character password is generated and shown once). The new account can sign in immediately and starts without any tournament.

To give an account access to a tournament, the tournament's owner adds it by email from the event page, as for any user.

`POST /api/super-admin/accounts` is the only endpoint and returns 401/403 to everyone except the super admin. Verified by `npm run test:super-admin-http` (needs `SUPER_ADMIN_PASSWORD`).
