// ============================================================================
// CourtListener / RECAP Provider
// ============================================================================
// Connects to the CourtListener API (Free Law Project) — open access to
// court opinions, oral arguments, judges, and PACER docket data from
// federal and state courts.
//
// API Docs: https://www.courtlistener.com/api/rest-info/

import { BaseGovernmentProvider, ProviderError } from './base-provider';
import {
  GovernmentDomain,
  GovernmentRecord,
  JurisdictionLevel,
  ProviderId,
  ProviderCapabilities,
  ProviderHealth,
  RecordAction,
  RecordActor,
  RecordStatus,
  SearchParams,
  SearchResult,
  ContentFormat,
} from '../types';

// -- CourtListener API response types --

interface CLOpinion {
  id: number;
  absolute_url: string;
  cluster: string; // URL to cluster
  author: number | null;
  joined_by: number[];
  type: string; // '010combined', '015unamimous', etc.
  sha1: string;
  page_count: number;
  download_url: string | null;
  local_path: string | null;
  plain_text: string;
  html: string;
  html_lawbox: string;
  html_columbia: string;
  html_with_citations: string;
  date_created: string;
  date_modified: string;
}

interface CLCluster {
  id: number;
  absolute_url: string;
  case_name: string;
  case_name_short: string;
  case_name_full: string;
  date_filed: string;
  date_filed_is_approximate: boolean;
  docket: string; // URL to docket
  citation_count: number;
  precedential_status: string;
  judges: string;
  nature_of_suit: string;
  attorneys: string;
  syllabus: string;
  posture: string;
  source: string;
  sub_opinions: string[]; // URLs to opinions
  date_created: string;
  date_modified: string;
}

interface CLDocket {
  id: number;
  absolute_url: string;
  case_name: string;
  date_filed: string;
  date_terminated: string | null;
  date_last_filing: string | null;
  court: string; // court ID
  court_id: string;
  docket_number: string;
  nature_of_suit: string;
  cause: string;
  assigned_to_str: string;
  referred_to_str: string;
  source: number;
  pacer_case_id: string;
  date_created: string;
  date_modified: string;
}

interface CLJudge {
  id: number;
  absolute_url: string;
  name_first: string;
  name_middle: string;
  name_last: string;
  name_suffix: string;
  date_dob: string | null;
  date_dod: string | null;
  dob_city: string;
  dob_state: string;
  gender: string;
  race: string[];
  positions: Array<{
    court: { id: string; full_name: string };
    position_type: string;
    date_start: string;
    date_termination: string | null;
    appointer?: { person: { name_last: string } };
  }>;
}

interface CLSearchResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Array<{
    id: number;
    caseName: string;
    court: string;
    court_id: string;
    dateFiled: string;
    docketNumber: string;
    suitNature: string;
    judge: string;
    citation: string[];
    citeCount: number;
    status: string;
    absolute_url: string;
    snippet: string;
  }>;
}

/**
 * CourtListener API Provider.
 *
 * Covers:
 * - COURT_DECISIONS (opinions, orders, dockets from federal and state courts)
 * - PERSONNEL (judge profiles, appointment history)
 */
export class CourtListenerProvider extends BaseGovernmentProvider {
  readonly id: ProviderId = {
    slug: 'court-listener',
    name: 'CourtListener / RECAP (Free Law Project)',
    version: '1.0.0',
  };

  readonly capabilities: ProviderCapabilities = {
    domains: [GovernmentDomain.COURT_DECISIONS, GovernmentDomain.PERSONNEL],
    jurisdictions: [JurisdictionLevel.FEDERAL, JurisdictionLevel.STATE],
    jurisdictionCodes: [], // All US jurisdictions
    supportsSearch: true,
    supportsIncrementalSync: true,
    supportsWebhooks: false,
    supportsFullText: true,
    contentFormats: [ContentFormat.HTML, ContentFormat.PLAIN_TEXT, ContentFormat.PDF],
    maxResultsPerQuery: 100,
    estimatedRecordCount: 10_000_000,
    features: {
      opinions: true,
      oralArguments: true,
      dockets: true,
      judges: true,
      citations: true,
      recapArchive: true,
      fullTextSearch: true,
      citationNetwork: true,
    },
  };

  protected async onInitialize(): Promise<void> {
    if (!this.config.baseUrl) {
      this.config.baseUrl = 'https://www.courtlistener.com/api/rest/v4';
    }
  }

  private get authHeaders(): Record<string, string> {
    return this.config.apiKey
      ? { Authorization: `Token ${this.config.apiKey}` }
      : {};
  }

  async fetchRecord(externalId: string): Promise<GovernmentRecord> {
    // Try as opinion cluster first, then as docket
    try {
      const cluster = await this.request<CLCluster>(
        `/clusters/${externalId}/`,
        { headers: this.authHeaders },
      );
      return this.normalizeCluster(cluster);
    } catch {
      const docket = await this.request<CLDocket>(
        `/dockets/${externalId}/`,
        { headers: this.authHeaders },
      );
      return this.normalizeDocket(docket);
    }
  }

  async fetchRecordText(externalId: string): Promise<string> {
    // Fetch opinion text
    const opinion = await this.request<CLOpinion>(
      `/opinions/${externalId}/`,
      { headers: this.authHeaders },
    );

    return (
      opinion.plain_text ||
      opinion.html_with_citations ||
      opinion.html ||
      opinion.html_lawbox ||
      opinion.html_columbia ||
      'No text available'
    );
  }

  async search(params: SearchParams): Promise<SearchResult> {
    const queryParts: string[] = [];

    if (params.query) {
      queryParts.push(`q=${encodeURIComponent(params.query)}`);
    }

    if (params.dateFrom) {
      queryParts.push(`filed_after=${params.dateFrom}`);
    }
    if (params.dateTo) {
      queryParts.push(`filed_before=${params.dateTo}`);
    }
    if (params.jurisdiction) {
      queryParts.push(`court=${params.jurisdiction}`);
    }

    const limit = params.limit ?? 20;
    const page = params.offset ? Math.floor(params.offset / limit) + 1 : 1;
    queryParts.push(`page_size=${limit}`, `page=${page}`);

    if (params.sortBy === 'date') {
      queryParts.push(
        `order_by=${params.sortOrder === 'asc' ? '' : '-'}dateFiled`,
      );
    } else if (params.sortBy === 'relevance') {
      queryParts.push('order_by=score desc');
    }

    // Use the search endpoint
    const response = await this.request<CLSearchResponse>(
      `/search/?${queryParts.join('&')}&type=o`,
      { headers: this.authHeaders },
    );

    return {
      records: response.results.map((r) => this.normalizeSearchResult(r)),
      total: response.count,
      hasMore: !!response.next,
      nextOffset: response.next ? page * limit : undefined,
    };
  }

  async fetchUpdatedSince(since: Date): Promise<GovernmentRecord[]> {
    const dateStr = since.toISOString().split('T')[0];
    const response = await this.request<CLSearchResponse>(
      `/search/?type=o&filed_after=${dateStr}&order_by=-dateFiled&page_size=100`,
      { headers: this.authHeaders },
    );

    return response.results.map((r) => this.normalizeSearchResult(r));
  }

  /**
   * Fetch judge profile by ID.
   */
  async fetchJudge(judgeId: string): Promise<GovernmentRecord> {
    const judge = await this.request<CLJudge>(
      `/people/${judgeId}/`,
      { headers: this.authHeaders },
    );
    return this.normalizeJudge(judge);
  }

  /**
   * Fetch citation network for an opinion.
   */
  async fetchCitations(
    clusterId: string,
    direction: 'citing' | 'cited_by' = 'cited_by',
  ): Promise<GovernmentRecord[]> {
    const response = await this.request<CLSearchResponse>(
      `/search/?type=o&${direction === 'cited_by' ? 'cites' : 'cited_by'}=${clusterId}&page_size=50`,
      { headers: this.authHeaders },
    );

    return response.results.map((r) => this.normalizeSearchResult(r));
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      await this.request<CLSearchResponse>(
        '/search/?type=o&page_size=1',
        { headers: this.authHeaders },
      );
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        message: 'CourtListener API is responsive',
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        message: `Health check failed: ${(error as Error).message}`,
      };
    }
  }

  // -- Normalization --

  private normalizeCluster(cluster: CLCluster): GovernmentRecord {
    const actions: RecordAction[] = [];

    if (cluster.date_filed) {
      actions.push({
        date: cluster.date_filed,
        description: `Opinion filed${cluster.date_filed_is_approximate ? ' (approximate)' : ''}`,
        actionType: 'filed',
      });
    }

    const judges: RecordActor[] = cluster.judges
      ? cluster.judges.split(',').map((j) => ({
          name: j.trim(),
          role: 'judge',
        }))
      : [];

    return {
      externalId: String(cluster.id),
      providerSlug: this.id.slug,
      domain: GovernmentDomain.COURT_DECISIONS,
      jurisdiction: {
        level: JurisdictionLevel.FEDERAL,
        code: 'US',
        name: 'United States',
      },
      title: cluster.case_name,
      identifier: cluster.case_name_short || cluster.case_name,
      status: this.mapPrecedentialStatus(cluster.precedential_status),
      dateIntroduced: cluster.date_filed,
      dateUpdated: cluster.date_modified,
      summary: cluster.syllabus || undefined,
      sourceUrls: [
        `https://www.courtlistener.com${cluster.absolute_url}`,
      ],
      author: judges[0],
      coAuthors: judges.slice(1),
      actions,
      subjects: cluster.nature_of_suit
        ? [cluster.nature_of_suit]
        : [],
      extensions: {
        citationCount: cluster.citation_count,
        precedentialStatus: cluster.precedential_status,
        posture: cluster.posture,
        attorneys: cluster.attorneys,
        source: cluster.source,
        subOpinions: cluster.sub_opinions,
      },
    };
  }

  private normalizeDocket(docket: CLDocket): GovernmentRecord {
    const actions: RecordAction[] = [];

    if (docket.date_filed) {
      actions.push({
        date: docket.date_filed,
        description: 'Case filed',
        actionType: 'filed',
      });
    }
    if (docket.date_terminated) {
      actions.push({
        date: docket.date_terminated,
        description: 'Case terminated',
        actionType: 'terminated',
      });
    }
    if (docket.date_last_filing) {
      actions.push({
        date: docket.date_last_filing,
        description: 'Last filing',
        actionType: 'filing',
      });
    }

    return {
      externalId: String(docket.id),
      providerSlug: this.id.slug,
      domain: GovernmentDomain.COURT_DECISIONS,
      jurisdiction: {
        level: JurisdictionLevel.FEDERAL,
        code: docket.court_id,
        name: docket.court_id,
      },
      title: docket.case_name,
      identifier: docket.docket_number,
      status: docket.date_terminated
        ? RecordStatus.ARCHIVED
        : RecordStatus.ACTIVE,
      dateIntroduced: docket.date_filed,
      dateUpdated: docket.date_modified,
      sourceUrls: [
        `https://www.courtlistener.com${docket.absolute_url}`,
      ],
      author: docket.assigned_to_str
        ? { name: docket.assigned_to_str, role: 'assigned-judge' }
        : undefined,
      actions,
      subjects: docket.nature_of_suit
        ? [docket.nature_of_suit]
        : [],
      extensions: {
        cause: docket.cause,
        referredTo: docket.referred_to_str,
        pacerCaseId: docket.pacer_case_id,
        courtId: docket.court_id,
      },
    };
  }

  private normalizeJudge(judge: CLJudge): GovernmentRecord {
    const fullName = [
      judge.name_first,
      judge.name_middle,
      judge.name_last,
      judge.name_suffix,
    ]
      .filter(Boolean)
      .join(' ');

    const actions: RecordAction[] = judge.positions?.map((pos) => ({
      date: pos.date_start,
      description: `${pos.position_type} at ${pos.court?.full_name ?? 'Unknown Court'}${pos.appointer ? `, appointed by ${pos.appointer.person.name_last}` : ''}`,
      actionType: 'appointment',
    })) ?? [];

    return {
      externalId: String(judge.id),
      providerSlug: this.id.slug,
      domain: GovernmentDomain.PERSONNEL,
      jurisdiction: {
        level: JurisdictionLevel.FEDERAL,
        code: 'US',
        name: 'United States',
      },
      title: fullName,
      identifier: `judge-${judge.id}`,
      status: judge.date_dod ? RecordStatus.ARCHIVED : RecordStatus.ACTIVE,
      dateIntroduced:
        judge.positions?.[0]?.date_start ?? judge.date_dob ?? '',
      dateUpdated: new Date().toISOString(),
      sourceUrls: [
        `https://www.courtlistener.com${judge.absolute_url}`,
      ],
      author: { name: fullName, role: 'judge' },
      actions,
      extensions: {
        gender: judge.gender,
        race: judge.race,
        birthCity: judge.dob_city,
        birthState: judge.dob_state,
        positions: judge.positions,
      },
    };
  }

  private normalizeSearchResult(result: {
    id: number;
    caseName: string;
    court: string;
    court_id: string;
    dateFiled: string;
    docketNumber: string;
    suitNature: string;
    judge: string;
    citation: string[];
    citeCount: number;
    status: string;
    absolute_url: string;
    snippet: string;
  }): GovernmentRecord {
    return {
      externalId: String(result.id),
      providerSlug: this.id.slug,
      domain: GovernmentDomain.COURT_DECISIONS,
      jurisdiction: {
        level: JurisdictionLevel.FEDERAL,
        code: result.court_id,
        name: result.court,
      },
      title: result.caseName,
      identifier: result.docketNumber || result.caseName,
      status: this.mapPrecedentialStatus(result.status),
      dateIntroduced: result.dateFiled,
      dateUpdated: result.dateFiled,
      summary: result.snippet,
      sourceUrls: [
        `https://www.courtlistener.com${result.absolute_url}`,
      ],
      author: result.judge
        ? { name: result.judge, role: 'judge' }
        : undefined,
      subjects: result.suitNature ? [result.suitNature] : [],
      extensions: {
        citations: result.citation,
        citationCount: result.citeCount,
      },
    };
  }

  private mapPrecedentialStatus(status: string): RecordStatus {
    switch (status?.toLowerCase()) {
      case 'published':
      case 'precedential':
        return RecordStatus.ACTIVE;
      case 'unpublished':
      case 'non-precedential':
        return RecordStatus.ARCHIVED;
      case 'errata':
        return RecordStatus.AMENDED;
      case 'separate':
        return RecordStatus.ACTIVE;
      default:
        return RecordStatus.ACTIVE;
    }
  }
}
