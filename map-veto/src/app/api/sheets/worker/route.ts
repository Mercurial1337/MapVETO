import {NextRequest,NextResponse} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {createServiceClient} from '@/lib/supabase/server';
import {syncConnection} from '@/lib/sheets/sync';
export const maxDuration=60;
export async function POST(request:NextRequest){
 const db=createServiceClient();const {data:settings,error}=await db.from('sheet_worker_settings').select('secret').eq('id',true).single();
 const token=Buffer.from(request.headers.get('authorization')?.replace(/^Bearer /,'')||''),secret=Buffer.from(settings?.secret||'');
 if(error || !settings || token.length!==secret.length || !timingSafeEqual(token,secret))return NextResponse.json({error:'Unauthorized'},{status:401});
 const {data:connections,error:claimError}=await db.rpc('sheet_claim_sync');if(claimError)return NextResponse.json({error:'Could not claim sync work'},{status:500});
 const results=await Promise.all((connections||[]).map(async (connection:Parameters<typeof syncConnection>[0])=>{try{return {eventId:connection.event_id,...await syncConnection(connection)};}catch{return {eventId:connection.event_id,error:'Sync failed; see event status'};}}));
 return NextResponse.json({results});
}
