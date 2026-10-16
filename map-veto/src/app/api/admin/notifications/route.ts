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
    const completed=await db.from('matches').select('id,team_a_name,team_b_name,completed_at').or(scope).eq('status','completed').not('completed_at','is',null).order('completed_at',{ascending:false}).limit(20);
    if (completed.error) return NextResponse.json({error:'Could not load notifications'}, {status:500});
    return NextResponse.json({notifications:completed.data,eventIds,userId:user.id},{headers:{'Cache-Control':'no-store'}});
}
