import type {User} from '@supabase/supabase-js';
// The single platform account allowed to create accounts and assign tournament staff.
// app_metadata can only be written with the service role (see scripts/create-super-admin.mjs).
export const SUPER_ADMIN_EMAIL='superadmin@vg.com';
export const isSuperAdmin=(user:Pick<User,'app_metadata'>|null|undefined)=>user?.app_metadata?.role==='super_admin';
