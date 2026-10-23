export type EventStaffRole = 'admin' | 'referee' | 'vanguard';
export type EventRole = 'owner' | EventStaffRole | null;

export const eventRoleLabel = (role: EventRole): string =>
    role === 'owner' ? 'Owner' : role === 'vanguard' ? 'Vanguard' : role === 'admin' ? 'Head Ref' : role === 'referee' ? 'Referee' : 'No access';

export const canManageEventMatches = (role: EventRole): boolean =>
    role === 'owner' || role === 'vanguard' || role === 'admin';

export const canAddEventStaff = (role: EventRole): boolean =>
    role === 'owner' || role === 'vanguard';

export const canAssignEventRole = (actor: EventRole, target: EventStaffRole): boolean =>
    actor === 'owner' || (actor === 'vanguard' && (target === 'admin' || target === 'referee'));
