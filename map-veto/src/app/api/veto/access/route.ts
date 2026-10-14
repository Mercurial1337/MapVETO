import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {createServiceClient} from '@/lib/supabase/server';
import {accessSecret} from '@/lib/auth/teamAccess';
import {TEAM_SESSION_SECONDS,signTeamSession,teamCookie,verifyPassword} from '@/lib/auth/teamPassword';
const schema=z.object({match_id:z.string().uuid(),token:z.string().uuid(),password:z.string().min(1).max(256)});
const json=(data:unknown,status=200,headers:Record<string,string>={})=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
// Unlocks one team link after the match password is verified. The password is never logged or returned.
export async function POST(request:NextRequest) {
 const input=schema.safeParse(await request.json().catch(()=>null));
 if(!input.success)return json({error:'Enter the match password.'},400);
 const {match_id,token,password}=input.data,db=createServiceClient();
 const [link,lock]=await Promise.all([
  db.from('match_links').select('link_type,expires_at').eq('match_id',match_id).eq('token',token).maybeSingle(),
  db.from('match_team_passwords').select('password_hash,version').eq('match_id',match_id).maybeSingle(),
 ]);
 if(link.error || lock.error)return json({error:'Could not verify the password. Please retry.'},503);
 const actor=link.data?.link_type;
 if((actor!=='team_a' && actor!=='team_b') || (link.data?.expires_at && Date.parse(link.data.expires_at)<=Date.now()))return json({error:'Invalid or expired team link.'},401);
 if(!lock.data)return json({success:true});
 // Each attempt is reserved before verification, so parallel guesses share the same limit.
 const {data:wait,error}=await db.rpc('match_password_reserve',{p_match:match_id,p_actor:actor});
 if(error)return json({error:'Could not verify the password. Please retry.'},503);
 if(wait>0){const minutes=Math.ceil(wait/60);return json({error:`Too many incorrect attempts. Try again in ${minutes} minute${minutes===1?'':'s'}.`,retry_after:wait},429,{'Retry-After':String(wait)});}
 if(!await verifyPassword(password,lock.data.password_hash))return json({error:'Incorrect password. Check the password supplied for this match.'},401);
 await db.from('match_password_attempts').delete().eq('match_id',match_id).eq('actor',actor);
 const response=json({success:true});
 response.cookies.set(teamCookie(match_id,actor),signTeamSession({match:match_id,actor,version:lock.data.version,expires:Date.now()+TEAM_SESSION_SECONDS*1000},await accessSecret()),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:TEAM_SESSION_SECONDS});
 return response;
}
