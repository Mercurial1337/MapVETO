-- =============================================
-- Migration: Event Admins
-- Allows event owners to add admin users to their events
-- =============================================

CREATE TABLE event_admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'admin' CHECK (role IN ('admin')),
    added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(event_id, user_id)
);

CREATE INDEX idx_event_admins_event_id ON event_admins(event_id);
CREATE INDEX idx_event_admins_user_id ON event_admins(user_id);

ALTER TABLE event_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Event admins are publicly readable" ON event_admins
    FOR SELECT USING (true);

CREATE POLICY "Service role full access event_admins" ON event_admins
    FOR ALL USING (auth.role() = 'service_role');
