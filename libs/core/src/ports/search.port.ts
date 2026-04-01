import { SearchResult } from '../types/agent.types';

export interface SearchPort {
  search(
    query: string,
    tenantId: string,
    limit?: number,
    fileIds?: string[],
  ): Promise<SearchResult[]>;
}

export const SEARCH_PORT = Symbol('SEARCH_PORT');
