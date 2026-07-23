export type AppRole = 'admin' | 'leader' | 'consultant' | 'operator';

export interface AppProfile {
  id: string;
  display_name: string;
  role: AppRole;
  department: string | null;
  status: 'active' | 'disabled';
  created_at?: string;
  updated_at?: string;
}

export interface ActiveSession {
  session: {
    access_token: string;
    user: { id: string };
  };
  profile: AppProfile;
}

export interface Person {
  id: string; chinese_name?: string; english_name?: string; aliases?: string; avatar_url?: string;
  current_organization_id?: string; current_position?: string; location?: string; country?: string;
  industry?: string; primary_domain?: string; secondary_domains?: string; talent_level?: string;
  summary?: string; summary_raw?: string; source_type?: string; owner_user_id?: string;
  review_status?: string; outreach_status?: string; data_completeness?: number; is_do_not_contact?: boolean;
  organization_name?: string; owner_name?: string; paper_count?: number; project_count?: number;
  relationship_count?: number; contact_count?: number; created_at?: string; updated_at?: string; deleted_at?: string;
}

export interface Organization {
  id: string; name: string; name_zh?: string; english_name?: string; organization_type: string; parent_id?: string;
  industry?: string; country?: string; city?: string; website?: string; description?: string;
}

export interface Experience {
  id: string; person_id: string; organization_id?: string; experience_type: string; title?: string;
  department?: string; major?: string; start_date?: string; end_date?: string; is_current?: boolean;
  description?: string; verified?: boolean; organization_name?: string;
}

export interface Paper { id: string; title: string; title_zh?: string; abstract?: string; publication_date?: string; venue?: string; citation_count?: number; domains?: string; source_url?: string }
export interface Project { id: string; name: string; project_type?: string; url?: string; description?: string; domains?: string; stars_count?: number; organization_name?: string }

export interface Contact {
  id: string; contact_type: string; masked_value?: string; value?: string; source_type?: string;
  source_url?: string; is_valid?: boolean; is_public?: boolean;
}

export interface Relationship {
  id: string; person_a_id: string; person_b_id: string; relationship_type: string;
  relationship_strength?: string; score?: number; is_inferred?: boolean; is_verified?: boolean;
  verification_status?: string; can_introduce?: boolean; the_other_name?: string; the_other_id?: string;
  the_other_org?: string; evidence_count?: number;
}

export interface RelationshipEvidence { id: string; relationship_id: string; evidence_type?: string; description?: string; source_url?: string; base_score?: number; confidence?: number; time_overlap_score?: number }

export interface Outreach {
  id: string; person_id: string; user_id?: string; position_id?: string; outreach_channel?: string;
  outreach_at?: string; content_summary?: string; response_status?: string; response_summary?: string;
  intention_level?: string; next_action?: string; next_follow_up_at?: string; willing_to_refer?: boolean;
  consultant_name?: string; position_title?: string;
}

export interface Position {
  id: string; company_id?: string; title: string; industry?: string; primary_domain?: string; level?: string;
  location?: string; salary_min?: number; salary_max?: number; responsibilities?: string; requirements?: string;
  preferred_conditions?: string; status?: string; owner_user_id?: string; company_name?: string;
  owner_name?: string; updated_at?: string;
}

export interface Match {
  id: string; person_id: string; position_id: string; match_score?: number; match_reasons?: string;
  risks?: string; questions_to_confirm?: string; consultant_rating?: string; position_title?: string;
  company_name?: string; person_name?: string; chinese_name?: string; english_name?: string;
}

export interface GraphNode { id: string; label?: string; chinese_name?: string; english_name?: string; node_type?: string; shape?: string; org?: string; domain?: string; avatar?: string }
export interface GraphEdge { id?: string; source?: string; target?: string; person_a_id?: string; person_b_id?: string; relationship_type: string; relationship_strength?: string; strength?: string; score: number; is_inferred: boolean; is_verified: boolean; evidence_count?: number; label?: string }
export interface GraphData { center?: GraphNode; nodes: GraphNode[]; edges: GraphEdge[]; max_nodes?: number; maxNodes?: number }

export interface Dashboard {
  total_persons: number; new_this_week: number; with_contact: number; outreach_this_month: number;
  replied: number; verified_relations: number; domain_distribution: { name: string; value: number }[];
  top_schools: { name: string; value: number }[]; top_companies: { name: string; value: number }[];
  high_potential: { id: string; name: string; domain: string; level: string; position: string }[];
  today_followups: { id: string; person_id: string; next_follow_up_at: string }[];
  total_organizations?: number; open_positions?: number; pending_followups?: number;
}

export interface MergeTask {
  id: string; primary_person_id: string; duplicate_person_id: string; similarity_score?: number;
  matching_evidence?: string; conflict_fields?: string; status: string; primary_name?: string; duplicate_name?: string;
}

export const LEVEL_COLOR: Record<string, string> = {
  S: 'bg-forest-600 text-white', A: 'bg-forest-100 text-forest-700',
  B: 'bg-warm-200 text-warm-600', C: 'bg-warm-100 text-warm-500',
};

export const STRENGTH_LABEL: Record<string, string> = { strong: '强关系', medium_strong: '较强关系', medium: '中等关系', weak: '弱关系', minimal: '仅领域关联' };
export const REL_TYPE_LABEL: Record<string, string> = { coauthor: '共同论文', colleague: '同事', classmate: '同学', labmate: '同实验室', project_mate: '共同项目', event_mate: '同活动', manual_introduce: '人工确认' };

export function parseJSON<T>(value?: string | null): T | null {
  if (!value) return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}
