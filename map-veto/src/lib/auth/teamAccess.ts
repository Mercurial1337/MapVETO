import {staffLinkAccess} from './matchAdmin';
import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {createServiceClient} from '@/lib/supabase/server';
import {teamCookie,validTeamSession,type TeamActor} from './teamPassword';

class StaffLinkError extends Error {constructor(public loginRequired:boolean){super(loginRequired?'Sign in to open this staff link.':'Your account does not have permission for this staff link.');}}

let secret:Promise<string>|null=null;
// Service-only random secret for password fingerprints and signed team sessions.
export function accessSecret() {
 secret??=(async()=>{
  const {data,error}=await createServiceClient().from('match_access_settings').select('secret').eq('id',true).single();
  if(error || !data?.secret)throw new Error('Match passwords are not configured. Apply the latest database migration.');
  return data.secret as string;
 })().catch(error=>{secret=null;throw error;});
 return secret;
}

// Staff and observer links keep their existing checks; a password-protected team
// link additionally needs a match-scoped session issued by /api/veto/access.
export async function teamPasswordRequired(matchId:string,token:string) {
 const db=createServiceClient();
 const [link,lock]=await Promise.all([
  db.from('match_links').select('token,link_type,expires_at').eq('match_id',matchId).eq('token',token).maybeSingle(),
  db.from('match_team_passwords').select('version').eq('match_id',matchId).maybeSingle(),
 ]);
 if(link.error || lock.error)throw new Error('Could not verify match access');
 if(link.data && ['admin','referee'].includes(link.data.link_type)){const staff=await staffLinkAccess(matchId,token,link.data);if(!staff.access)throw new StaffLinkError(staff.loginRequired);}
 const actor=link.data?.link_type as TeamActor|undefined;
 if(!lock.data || (actor!=='team_a' && actor!=='team_b'))return false;
 const value=(await cookies()).get(teamCookie(matchId,actor))?.value;
 return !validTeamSession(value,await accessSecret(),{match:matchId,actor,version:lock.data.version});
}

export async function teamGate(matchId:string,token:string):Promise<NextResponse|null> {
 try {
  if(!await teamPasswordRequired(matchId,token))return null;
  return NextResponse.json({error:'Enter your team password to continue.',password_required:true},{status:401,headers:{'Cache-Control':'no-store'}});
 } catch (error) {if(error instanceof StaffLinkError)return NextResponse.json({error:error.message,staff_access_required:true,login_required:error.loginRequired},{status:error.loginRequired?401:403,headers:{'Cache-Control':'no-store'}});return NextResponse.json({error:'Could not verify match access. Please retry.'},{status:503});}
}
