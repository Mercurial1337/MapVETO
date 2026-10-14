import {createHmac,randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
// Team passwords are stored as salted scrypt hashes only. Change detection uses a
// fingerprint keyed by a service-only secret, so sheet snapshots never hold plaintext.
export type TeamActor='team_a'|'team_b';
export interface TeamSession {match:string;actor:TeamActor;version:number;expires:number;}
export const TEAM_SESSION_SECONDS=4*60*60;
const COST=16384,BLOCK=8,PARALLEL=1,LENGTH=32;
function derive(password:string,salt:Buffer,cost=COST,block=BLOCK,parallel=PARALLEL,length=LENGTH) {
 return new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,length,{N:cost,r:block,p:parallel},(error,key)=>error?reject(error):resolve(key)));
}
export async function hashPassword(password:string) {
 const salt=randomBytes(16);
 return `scrypt$${COST}$${BLOCK}$${PARALLEL}$${salt.toString('base64url')}$${(await derive(password,salt)).toString('base64url')}`;
}
export async function verifyPassword(password:string,stored:string) {
 const [kind,cost,block,parallel,salt,hash]=stored.split('$'),numbers=[cost,block,parallel].map(Number);
 if(kind!=='scrypt' || !salt || !hash || numbers.some(n=>!Number.isInteger(n) || n<1) || 128*numbers[0]*numbers[1]>32*1024*1024 || numbers[2]>4)return false;
 const expected=Buffer.from(hash,'base64url');if(expected.length<16)return false;
 const actual=await derive(password,Buffer.from(salt,'base64url'),numbers[0],numbers[1],numbers[2],expected.length);
 return timingSafeEqual(actual,expected);
}
export const passwordFingerprint=(password:string,secret:string)=>createHmac('sha256',secret).update('team-password\0'+password).digest('hex');
export const teamCookie=(match:string,actor:TeamActor)=>`mv_team_${match}_${actor}`;
const sign=(body:string,secret:string)=>createHmac('sha256',secret).update('team-session\0'+body).digest();
export function signTeamSession(session:TeamSession,secret:string) {
 const body=Buffer.from(JSON.stringify(session)).toString('base64url');
 return body+'.'+sign(body,secret).toString('base64url');
}
// A session unlocks one team link of one match, for the password version it was issued under.
export function validTeamSession(value:string|undefined,secret:string,expected:Omit<TeamSession,'expires'>,now=Date.now()) {
 const [body,signature,extra]=(value || '').split('.');
 if(!body || !signature || extra!==undefined)return false;
 const given=Buffer.from(signature,'base64url'),wanted=sign(body,secret);
 if(given.length!==wanted.length || !timingSafeEqual(given,wanted))return false;
 try {
  const session=JSON.parse(Buffer.from(body,'base64url').toString('utf8')) as TeamSession;
  return session.match===expected.match && session.actor===expected.actor && session.version===expected.version && typeof session.expires==='number' && session.expires>now;
 } catch {return false;}
}
