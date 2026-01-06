import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// Request validation schema
const CreateMatchSchema = z.object({
    team_a_name: z.string().min(1).max(100),
    team_b_name: z.string().min(1).max(100),
    team_a_logo: z.string().url().optional().nullable(),
    team_b_logo: z.string().url().optional().nullable(),
    format: z.enum(['bo1', 'bo3', 'bo5']).default('bo3'),
    tournament_id: z.string().uuid().optional().nullable(),
    scheduled_at: z.string().datetime().optional().nullable(),
    template_id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Validate request body
        const validationResult = CreateMatchSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json(
                { error: validationResult.error.issues[0].message },
                { status: 400 }
            );
        }

        const data = validationResult.data;
        const supabase = createServiceClient();

        // Get default template for format if not specified
        let templateId = data.template_id;
        if (!templateId) {
            const { data: template } = await supabase
                .from('veto_templates')
                .select('id')
                .eq('format', data.format)
                .eq('is_default', true)
                .single();

            if (template) {
                templateId = template.id;
            } else {
                // Get any template for this format
                const { data: anyTemplate } = await supabase
                    .from('veto_templates')
                    .select('id')
                    .eq('format', data.format)
                    .limit(1)
                    .single();
                templateId = anyTemplate?.id;
            }
        }

        if (!templateId) {
            return NextResponse.json(
                { error: 'No veto template found. Please run schema.sql in your Supabase SQL Editor to set up the database.' },
                { status: 400 }
            );
        }

        // Create match
        const matchId = uuidv4();
        const { error: matchError } = await supabase
            .from('matches')
            .insert({
                id: matchId,
                tournament_id: data.tournament_id || null,
                veto_template_id: templateId,
                team_a_name: data.team_a_name,
                team_a_logo: data.team_a_logo || null,
                team_b_name: data.team_b_name,
                team_b_logo: data.team_b_logo || null,
                format: data.format,
                status: 'coin_toss',
                scheduled_at: data.scheduled_at || null,
            });

        if (matchError) {
            console.error('Match creation error:', matchError);
            return NextResponse.json(
                { error: `Failed to create match: ${matchError.message}` },
                { status: 500 }
            );
        }

        // The trigger should have created match_state and match_links
        // Fetch the generated links
        const { data: links, error: linksError } = await supabase
            .from('match_links')
            .select('link_type, token')
            .eq('match_id', matchId);

        if (linksError || !links) {
            console.error('Links fetch error:', linksError);
            return NextResponse.json(
                { error: 'Match created but failed to fetch links' },
                { status: 500 }
            );
        }

        // Format links for response
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
        const magicLinks: Record<string, { token: string; url: string }> = {};

        for (const link of links) {
            magicLinks[link.link_type] = {
                token: link.token,
                url: `${baseUrl}/match/${matchId}?token=${link.token}`,
            };
        }

        return NextResponse.json({
            success: true,
            match: {
                id: matchId,
                team_a_name: data.team_a_name,
                team_b_name: data.team_b_name,
                format: data.format,
                status: 'coin_toss',
            },
            links: magicLinks,
        });
    } catch (error) {
        console.error('Create match error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// GET handler to list matches
export async function GET(request: NextRequest) {
    try {
        const supabase = createServiceClient();
        const { searchParams } = new URL(request.url);

        const status = searchParams.get('status');
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = parseInt(searchParams.get('offset') || '0');

        let query = supabase
            .from('matches')
            .select(`
        id,
        team_a_name,
        team_a_logo,
        team_b_name,
        team_b_logo,
        format,
        status,
        scheduled_at,
        created_at,
        tournament_id
      `)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (status) {
            query = query.eq('status', status);
        }

        const { data: matches, error } = await query;

        if (error) {
            return NextResponse.json(
                { error: 'Failed to fetch matches' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            matches,
            pagination: {
                offset,
                limit,
                count: matches?.length || 0,
            },
        });
    } catch (error) {
        console.error('List matches error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
