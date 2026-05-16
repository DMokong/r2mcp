export type EntityType = 'project' | 'person' | 'tool' | 'decision';
export const ENTITY_TYPES: readonly EntityType[] = ['project', 'person', 'tool', 'decision'] as const;

export interface EntityRow {
  id: string;
  type: EntityType;
  canonical_name: string;
  normalized_name: string;
  aliases: string[];
  metadata: Record<string, unknown>;
  first_seen_at: Date;
  last_seen_at: Date;
}

export interface MemoryEntityLink {
  memory_id: string;
  entity_id: string;
  confidence: number;
  source: string;
}

export interface ExtractionMatched { canonical_name: string; confidence: number; }
export interface ExtractionNewEntity { type: EntityType; canonical_name: string; aliases?: string[]; confidence: number; }
export interface ExtractionResponse { matched: ExtractionMatched[]; new_entities: ExtractionNewEntity[]; }

export interface RunSummary {
  run_id: string;
  started_at: string;
  ended_at: string;
  memories_seen: number;
  memories_extracted: number;
  entities_created: number;
  entities_updated: number;
  links_created: number;
  total_cost_usd: number;
  hit_cost_cap: boolean;
  error?: string;
  parse_failures?: number;
}

export interface StateRecord {
  run_id: string;
  memory_id: string;
  status: 'extracted' | 'parse_failed' | 'cap_reached' | 'skipped';
  timestamp: string;
  raw?: string; // for parse_failed, truncated to 2KB
}
