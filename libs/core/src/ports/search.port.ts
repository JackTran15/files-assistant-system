import { SearchResult } from '../types/agent.types';

export interface SearchPort {
  hybridSearch(
    query: string,
    tenantId: string,
    limit?: number,
    alpha?: number,
    fileIds?: string[],
  ): Promise<SearchResult[]>;

  keywordSearch(
    query: string,
    tenantId: string,
    limit?: number,
    fileIds?: string[],
  ): Promise<SearchResult[]>;
}

export const SEARCH_PORT = Symbol('SEARCH_PORT');
