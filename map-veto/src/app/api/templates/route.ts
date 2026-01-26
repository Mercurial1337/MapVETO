import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const format = searchParams.get('format');

        const supabase = createServiceClient();

        let query = supabase
            .from('veto_templates')
            .select('*')
            .order('is_default', { ascending: false })
            .order('name');

        if (format) {
            query = query.eq('format', format);
        }

        const { data: templates, error } = await query;

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ templates });
    } catch (error) {
        console.error('Error fetching templates:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
