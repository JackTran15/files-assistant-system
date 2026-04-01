import { SearchResult } from '../types/agent.types';

export interface SearchPort {
  hybridSearch(
    query: string,
    tenantId: string,
    limit?: number,
    alpha?: number,
  ): Promise<SearchResult[]>;

  keywordSearch(
    query: string,
    tenantId: string,
    limit?: number,
  ): Promise<SearchResult[]>;
}

export const SEARCH_PORT = Symbol('SEARCH_PORT');
