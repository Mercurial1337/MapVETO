import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getEventRole } from '@/lib/auth/eventAuth';
import { isSuperAdmin } from './superAdminRole';
import {canManageEventMatches} from './eventRoles';

interface StaffLink {token:string;link_type:string;expires_at:string|null;}
type StaffAccess={role:'admin'|'referee';token:string};
export interface StaffLinkResult {isStaff:boolean;loginRequired:boolean;access:StaffAccess|null;}

// Explicit links cap privileges: an owner using a Referee link remains a Referee.
// Team/Observer links never inherit account permissions.
export async function staffLinkAccess(matchId:string,token:string,knownLink?:StaffLink):Promise<StaffLinkResult> {
 const db=createServiceClient();
 const link=knownLink || (await db.from('match_links').select('token,link_type,expires_at').eq('match_id',matchId).eq('token',token).maybeSingle()).data;
 if(!link || !['admin','referee'].includes(link.link_type))return {isStaff:false,loginRequired:false,access:null};
 const denied={isStaff:true,loginRequired:false,access:null};
 const {data:{user}}=await (await createClient()).auth.getUser();
 if(!user)return {...denied,loginRequired:true};
 if(isSuperAdmin(user) || (link.expires_at && Date.parse(link.expires_at)<=Date.now()))return denied;
 const {data:match}=await db.from('matches').select('created_by,event_id').eq('id',matchId).single();
 if(!match)return denied;
 const membership=match.event_id?await getEventRole(user.id,match.event_id):null;
 const head=match.event_id?canManageEventMatches(membership):match.created_by===user.id;
 const allowed=head || (link.link_type==='referee' && membership==='referee');
 return {...denied,access:allowed?{role:link.link_type as 'admin'|'referee',token:link.token}:null};
}

export async function matchStaffAccess(matchId:string,token?:string):Promise<StaffAccess|null> {
 if(token!==undefined)return (await staffLinkAccess(matchId,token)).access;
 const db=createServiceClient(),{data:{user}}=await (await createClient()).auth.getUser();
 if(!user || isSuperAdmin(user))return null;
 const {data:match}=await db.from('matches').select('created_by,event_id').eq('id',matchId).single();
 if(!match)return null;
 const membership=match.event_id?await getEventRole(user.id,match.event_id):null;
 const role=membership==='referee'?'referee':(match.event_id?canManageEventMatches(membership):match.created_by===user.id)?'admin':null;
 if(!role)return null;
 const {data:link}=await db.from('match_links').select('token,expires_at').eq('match_id',matchId).eq('link_type',role).single();
 return link && (!link.expires_at || Date.parse(link.expires_at)>Date.now())?{role,token:link.token}:null;
}
export async function matchAdminToken(matchId:string,token?:string):Promise<string|null> {
 const access=await matchStaffAccess(matchId,token);
 return access?.role==='admin'?access.token:null;
}
