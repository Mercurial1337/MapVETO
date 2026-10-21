# Super admin account

One account, `superadmin@vg.com`, manages platform accounts. It is marked by `app_metadata.role = "super_admin"`, which only the service role can write; the email alone grants nothing.

## Setup

`node scripts/create-super-admin.mjs` with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set:

- creates the account (email confirmed) with a generated password printed once, or with `SUPER_ADMIN_PASSWORD` if given;
- on an existing account, sets the role and keeps the password unless `SUPER_ADMIN_PASSWORD` is given;
- removes the role from any other account, so there is only ever one super admin.

## Admin → Accounts

Visible in the sidebar for the super admin only; the page and its APIs (`/api/super-admin/accounts`, `/api/super-admin/memberships`) return 401/403 for everyone else.

- **Create account**: email, optional password (at least 10 characters; otherwise a 24-character password is generated and shown once), optional tournament and role (Head Admin or Referee). The account can sign in immediately.
- **All accounts**: every account with its tournaments (Owner, Head Admin, Referee). Add an account to a tournament, change its role by adding it again, or remove it. A tournament's owner already has full access and cannot be added as staff.
- **Reset password**: replaces the password with a new generated one, shown once; the old password stops working.

Tournament owners can still add existing accounts to their own tournaments from the event settings as before.

Verified by `npm run test:super-admin-http` (needs `SUPER_ADMIN_PASSWORD`).
