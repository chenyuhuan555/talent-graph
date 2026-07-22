import type { GraphData, Relationship, RelationshipEvidence } from '@/lib/types';
import { requireData } from './errors';
import { defaultClient, type DataClient } from './shared';

export async function getRelationshipGraph(personId: string, maxNodes = 20, client: DataClient = defaultClient()): Promise<GraphData> {
  const raw = requireData(await client.rpc('relationship_graph', {
    center_person_id: personId, max_nodes: Math.min(50, Math.max(1, Math.trunc(maxNodes))),
  })) as GraphData;
  return {
    ...raw,
    center: raw.nodes.find((node) => node.id === personId),
    nodes: raw.nodes.map((node) => ({ ...node, label: node.label || node.chinese_name || node.english_name || '未命名', node_type: 'person', shape: 'circle' })),
    edges: raw.edges.map((edge) => ({ ...edge, source: edge.source || edge.person_a_id, target: edge.target || edge.person_b_id, strength: edge.strength || edge.relationship_strength })),
  };
}

export async function getPersonRelationships(personId: string, client: DataClient = defaultClient()): Promise<Relationship[]> {
  return requireData(await client.rpc('person_relationships', { target_person_id: personId })) as Relationship[];
}

export async function getRelationshipEvidence(relationshipId: string, client: DataClient = defaultClient()): Promise<RelationshipEvidence[]> {
  return requireData(await client.rpc('relationship_evidence_for', { target_relationship_id: relationshipId })) as RelationshipEvidence[];
}
