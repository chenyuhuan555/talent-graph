import type { Contact, Experience, Match, Paper, Person, Project } from '@/lib/types';
import { mapSupabaseError, requireData } from './errors';
import { boundedPage, boundedPageSize, defaultClient, type DataClient, type PageResult } from './shared';

export interface PersonSearch {
  page?: number; pageSize?: number; searchTerm?: string; domain?: string; level?: string;
  organizationId?: string; ownerId?: string;
}

export async function searchPersons(filters: PersonSearch = {}, client: DataClient = defaultClient()): Promise<PageResult<Person>> {
  const result = await client.rpc('search_persons', {
    search_term: filters.searchTerm || null,
    domain_filter: filters.domain || null,
    level_filter: filters.level || null,
    organization_filter: filters.organizationId || null,
    owner_filter: filters.ownerId || null,
    page_number: boundedPage(filters.page),
    page_size: boundedPageSize(filters.pageSize),
  });
  return requireData(result) as unknown as PageResult<Person>;
}

export async function discoverTalent(filters: PersonSearch = {}, client: DataClient = defaultClient()): Promise<PageResult<Person>> {
  const result = await client.rpc('discover_talent', {
    search_term: filters.searchTerm || null, domain_filter: filters.domain || null,
    level_filter: filters.level || null, page_number: boundedPage(filters.page),
    page_size: boundedPageSize(filters.pageSize),
  });
  return requireData(result) as unknown as PageResult<Person>;
}

async function personRpc<T>(name: string, personId: string, client: DataClient): Promise<T> {
  return requireData(await client.rpc(name, { target_person_id: personId })) as T;
}

export async function getPerson(id: string, client: DataClient = defaultClient()): Promise<Person | null> {
  const result = await client.rpc('person_detail', { target_person_id: id });
  if (result.error) throw mapSupabaseError(result.error);
  return result.data as Person | null;
}
export const getExperiences = (id: string, client: DataClient = defaultClient()) => personRpc<Experience[]>('person_experiences', id, client);
export const getPapers = (id: string, client: DataClient = defaultClient()) => personRpc<Paper[]>('person_papers', id, client);
export const getProjects = (id: string, client: DataClient = defaultClient()) => personRpc<Project[]>('person_projects', id, client);
export const getPersonMatches = (id: string, client: DataClient = defaultClient()) => personRpc<Match[]>('person_position_matches', id, client);

export async function getMaskedContacts(id: string, client: DataClient = defaultClient()): Promise<Contact[]> {
  return requireData(await client.rpc('masked_contacts_for_person', { target_person_id: id })) as Contact[];
}

export async function createPerson(input: Partial<Person>, client: DataClient = defaultClient()): Promise<Person> {
  const result = await client.from('persons').insert(input).select().single();
  return requireData(result) as Person;
}

export async function updatePerson(id: string, updatedAt: string, patch: Partial<Person>, client: DataClient = defaultClient()): Promise<Person> {
  return requireData(await client.rpc('update_person_if_current', {
    target_id: id, expected_updated_at: updatedAt, patch,
  })) as Person;
}

export async function addMaskedContact(personId: string, input: Pick<Contact, 'contact_type' | 'masked_value' | 'source_type' | 'source_url'>, client: DataClient = defaultClient()): Promise<Contact> {
  const result = await client.from('contacts').insert({ person_id: personId, ...input }).select().single();
  return requireData(result) as Contact;
}
