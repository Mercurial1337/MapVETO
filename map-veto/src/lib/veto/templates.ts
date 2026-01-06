import type { VetoSequence } from '@/types';

/**
 * Bo3 Standard Veto Sequence
 * 
 * 1. Team A Ban
 * 2. Team B Ban
 * 3. Team A Pick (Map 1)
 * 4. Team B Side Pick (Map 1)
 * 5. Team B Pick (Map 2)
 * 6. Team A Side Pick (Map 2)
 * 7. Team A Ban
 * 8. Team B Ban
 * 9. Decider (Auto)
 * 10. Team A Side Pick (Map 3)
 */
export const BO3_STANDARD: VetoSequence = {
    format: 'bo3',
    total_steps: 10,
    steps: [
        { step: 1, action: 'ban', actor: 'team_a', description: 'Team A bans a map' },
        { step: 2, action: 'ban', actor: 'team_b', description: 'Team B bans a map' },
        { step: 3, action: 'pick', actor: 'team_a', map_number: 1, description: 'Team A picks Map 1' },
        { step: 4, action: 'side', actor: 'team_b', map_number: 1, description: 'Team B picks side for Map 1' },
        { step: 5, action: 'pick', actor: 'team_b', map_number: 2, description: 'Team B picks Map 2' },
        { step: 6, action: 'side', actor: 'team_a', map_number: 2, description: 'Team A picks side for Map 2' },
        { step: 7, action: 'ban', actor: 'team_a', description: 'Team A bans a map' },
        { step: 8, action: 'ban', actor: 'team_b', description: 'Team B bans a map' },
        { step: 9, action: 'decider', actor: 'system', map_number: 3, description: 'Remaining map is decider' },
        { step: 10, action: 'side', actor: 'team_a', map_number: 3, description: 'Team A picks side for Map 3' },
    ],
};

/**
 * Bo5 Grand Finals Veto Sequence
 * 
 * 1. Winner's Bracket Team Bans 2 maps
 * 2. Team A Pick (Map 1)
 * 3. Team B Side Pick (Map 1)
 * 4. Team B Pick (Map 2)
 * 5. Team A Side Pick (Map 2)
 * 6. Team A Pick (Map 3)
 * 7. Team B Side Pick (Map 3)
 * 8. Team B Pick (Map 4)
 * 9. Team A Side Pick (Map 4)
 * 10. Decider (Auto)
 * 11. Team B Side Pick (Map 5)
 */
export const BO5_GRAND_FINALS: VetoSequence = {
    format: 'bo5',
    total_steps: 11,
    winner_bracket_team: 'team_a',
    steps: [
        { step: 1, action: 'ban', actor: 'team_a', count: 2, description: "Winner's Bracket Team bans 2 maps" },
        { step: 2, action: 'pick', actor: 'team_a', map_number: 1, description: 'Team A picks Map 1' },
        { step: 3, action: 'side', actor: 'team_b', map_number: 1, description: 'Team B picks side for Map 1' },
        { step: 4, action: 'pick', actor: 'team_b', map_number: 2, description: 'Team B picks Map 2' },
        { step: 5, action: 'side', actor: 'team_a', map_number: 2, description: 'Team A picks side for Map 2' },
        { step: 6, action: 'pick', actor: 'team_a', map_number: 3, description: 'Team A picks Map 3' },
        { step: 7, action: 'side', actor: 'team_b', map_number: 3, description: 'Team B picks side for Map 3' },
        { step: 8, action: 'pick', actor: 'team_b', map_number: 4, description: 'Team B picks Map 4' },
        { step: 9, action: 'side', actor: 'team_a', map_number: 4, description: 'Team A picks side for Map 4' },
        { step: 10, action: 'decider', actor: 'system', map_number: 5, description: 'Remaining map is decider' },
        { step: 11, action: 'side', actor: 'team_b', map_number: 5, description: 'Team B picks side for Map 5' },
    ],
};

/**
 * Bo1 Standard Veto Sequence
 * 
 * Each team bans until one map remains
 */
export const BO1_STANDARD: VetoSequence = {
    format: 'bo1',
    total_steps: 7,
    steps: [
        { step: 1, action: 'ban', actor: 'team_a', description: 'Team A bans a map' },
        { step: 2, action: 'ban', actor: 'team_b', description: 'Team B bans a map' },
        { step: 3, action: 'ban', actor: 'team_a', description: 'Team A bans a map' },
        { step: 4, action: 'ban', actor: 'team_b', description: 'Team B bans a map' },
        { step: 5, action: 'ban', actor: 'team_a', description: 'Team A bans a map' },
        { step: 6, action: 'ban', actor: 'team_b', description: 'Team B bans a map' },
        { step: 7, action: 'decider', actor: 'system', map_number: 1, description: 'Remaining map is played' },
    ],
};

/**
 * Get default veto template by format
 */
export function getDefaultTemplate(format: 'bo1' | 'bo3' | 'bo5'): VetoSequence {
    switch (format) {
        case 'bo1':
            return BO1_STANDARD;
        case 'bo3':
            return BO3_STANDARD;
        case 'bo5':
            return BO5_GRAND_FINALS;
        default:
            return BO3_STANDARD;
    }
}

/**
 * Valorant default competitive map pool
 */
export const VALORANT_DEFAULT_MAPS = [
    { name: 'Abyss', slug: 'abyss' },
    { name: 'Bind', slug: 'bind' },
    { name: 'Haven', slug: 'haven' },
    { name: 'Pearl', slug: 'pearl' },
    { name: 'Corrode', slug: 'corrode' },
    { name: 'Split', slug: 'split' },
    { name: 'Sunset', slug: 'sunset' },
];
