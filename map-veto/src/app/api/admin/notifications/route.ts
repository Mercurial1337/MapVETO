import {NextResponse} from 'next/server';
import {createClient,createServiceClient} from '@/lib/supabase/server';

// Completion timestamps are the persistent source of truth; no extra write/poll per player.
export async function GET() {
    const {data:{user}} = await (await createClient()).auth.getUser();
    if (!user) return NextResponse.json({error:'Unauthorized'}, {status:401});
    const db=createServiceClient();
    const [owned,memberships]=await Promise.all([
        db.from('events').select('id').eq('created_by',user.id),
        db.from('event_admins').select('event_id,role').eq('user_id',user.id),
    ]);
    if (owned.error || memberships.error) return NextResponse.json({error:'Could not load staff access'}, {status:500});
    const eventIds=[...new Set([...owned.data.map(event=>event.id),...memberships.data.map(event=>event.event_id)])];
    const scope=eventIds.length?`created_by.eq.${user.id},event_id.in.(${eventIds.join(',')})`:`created_by.eq.${user.id}`;
    const [completed,open]=await Promise.all([
     db.from('matches').select('id,team_a_name,team_b_name,completed_at').or(scope).eq('status','completed').not('completed_at','is',null).order('completed_at',{ascending:false}).limit(20),
     db.from('veto_timeout_requests').select('id,match_id,actor,reason,created_at,matches!inner(team_a_name,team_b_name,created_by,event_id)').eq('status','open').or(scope,{referencedTable:'matches'}).order('created_at',{ascending:false}).limit(100).returns<Array<{id:string;match_id:string;actor:string;reason:string;created_at:string;matches:{team_a_name:string;team_b_name:string}}>>()
    ]);
    if (completed.error || open.error) return NextResponse.json({error:'Could not load notifications'}, {status:500});
    const timeouts=open.data.map(report=>({id:report.id,matchId:report.match_id,teamA:report.matches.team_a_name,teamB:report.matches.team_b_name,requestedBy:report.actor==='team_a'?report.matches.team_a_name:report.matches.team_b_name,reason:report.reason,createdAt:report.created_at}));
    return NextResponse.json({notifications:completed.data,timeouts,eventIds,userId:user.id},{headers:{'Cache-Control':'no-store'}});
}
