// Database Types for Map VETO Management System

// ============================================
// Core Entity Types
// ============================================

export interface Game {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface GameMap {
  id: string;
  game_id: string;
  name: string;
  slug: string;
  image_url: string;
  callout_image_url: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface MapPool {
  id: string;
  game_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

export interface PoolMap {
  id: string;
  pool_id: string;
  map_id: string;
  display_order: number;
}

// ============================================
// Veto Template Types
// ============================================

export type VetoAction = 'ban' | 'pick' | 'side' | 'decider';
export type VetoActor = 'team_a' | 'team_b' | 'system';
export type MatchFormat = 'bo1' | 'bo3' | 'bo5';
export type SideChoice = 'attack' | 'defense';

export interface VetoStep {
  step: number;
  action: VetoAction;
  actor: VetoActor;
  description: string;
  map_number?: number;
  count?: number; // For multi-ban steps (e.g., Bo5 winner bracket 2 bans)
}

export interface VetoSequence {
  format: MatchFormat;
  total_steps: number;
  winner_bracket_team?: VetoActor;
  steps: VetoStep[];
}

export interface VetoTemplate {
  id: string;
  game_id: string;
  name: string;
  format: MatchFormat;
  sequence: VetoSequence;
  is_default: boolean;
  created_at: string;
}

// ============================================
// Tournament & Match Types
// ============================================

export interface Tournament {
  id: string;
  game_id: string;
  map_pool_id: string | null;
  name: string;
  google_sheet_id: string | null;
  metadata: Record<string, unknown>;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export type MatchStatus = 'pending' | 'coin_toss' | 'side_selection' | 'in_progress' | 'completed' | 'cancelled';

export interface Match {
  id: string;
  tournament_id: string | null;
  veto_template_id: string;
  team_a_name: string;
  team_a_logo: string | null;
  team_b_name: string;
  team_b_logo: string | null;
  format: MatchFormat;
  status: MatchStatus;
  coin_toss_winner: VetoActor | null;
  coin_toss_forced: boolean;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

// ============================================
// Match State Types (Realtime)
// ============================================

export interface BannedMap {
  map_id: string;
  banned_by: VetoActor;
}

export interface PickedMap {
  map_id: string;
  picked_by: VetoActor;
  side: SideChoice | null;
  side_picked_by?: VetoActor;
  map_number: number;
}

export interface MatchState {
  id: string;
  match_id: string;
  current_step: number;
  current_turn: VetoActor | null;
  available_maps: string[]; // Array of map IDs
  banned_maps: BannedMap[];
  picked_maps: PickedMap[];
  results: PickedMap[]; // Final ordered list
  is_complete: boolean;
  updated_at: string;
  // Maps real team (link_type) to template role
  // e.g., { team_a: 'team_b', team_b: 'team_a' } means token team_a plays as template team_b
  actor_mapping?: {
    team_a: 'team_a' | 'team_b';
    team_b: 'team_a' | 'team_b';
  };
}

// ============================================
// Access Control Types
// ============================================

export type LinkType = 'team_a' | 'team_b' | 'observer';

export interface MatchLink {
  id: string;
  match_id: string;
  link_type: LinkType;
  token: string;
  expires_at: string | null;
  created_at: string;
}

// ============================================
// Logging Types
// ============================================

export interface MatchLog {
  id: string;
  match_id: string;
  step_number: number;
  action_type: VetoAction;
  actor: VetoActor;
  map_id: string | null;
  side_choice: SideChoice | null;
  created_at: string;
}

// ============================================
// API Request/Response Types
// ============================================

export interface VetoActionRequest {
  match_id: string;
  token: string;
  action: Exclude<VetoAction, 'decider'>;
  map_id?: string;
  side_choice?: SideChoice;
}

export interface VetoActionResponse {
  success: boolean;
  new_state?: MatchState;
  error?: string;
}

export interface CoinTossRequest {
  match_id: string;
  token: string;
}

export interface CoinTossResponse {
  success: boolean;
  winner?: VetoActor;
  error?: string;
}

// ============================================
// UI State Types
// ============================================

export type MapCardState = 'available' | 'banned' | 'picked' | 'active';

export interface TeamIdentity {
  team: LinkType;
  match_id: string;
  team_name: string;
  team_logo: string | null;
  can_interact: boolean;
  is_my_turn: boolean;
}

// ============================================
// Realtime Payload Types
// ============================================

export interface MatchStatePayload {
  match_id: string;
  current_step: number;
  current_turn: VetoActor | null;
  available_maps: string[];
  banned_maps: BannedMap[];
  picked_maps: PickedMap[];
  is_complete: boolean;
  updated_at: string;
}

// ============================================
// Database Row Types (for Supabase queries)
// ============================================

export interface MatchWithRelations extends Match {
  match_state: MatchState;
  veto_template: VetoTemplate;
  tournament?: Tournament;
}

export interface MapPoolWithMaps extends MapPool {
  pool_maps: (PoolMap & { map: GameMap })[];
}
