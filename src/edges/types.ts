export type EdgeRelation =
  | 'supports'
  | 'contradicts'
  | 'supersedes'
  | 'evolved_into'
  | 'depends_on'
  | 'related_to';

export interface MemoryEdge {
  id: string;
  from_memory_id: string;
  to_memory_id: string;
  relation: EdgeRelation;
  confidence: number;
  rationale: string;
  classifier_version: string;
  valid_from: Date;
  valid_until: Date | null;
}

export type SignalKind = 'contradicts' | 'superseded_by';

export interface RecallSignal {
  kind: SignalKind;
  from_id: string;
  to_id: string;
  rationale: string;
  confidence: number;
}
