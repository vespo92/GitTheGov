// ============================================================================
// OpenStates Provider (State Legislature Data)
// ============================================================================
// Connects to the OpenStates / Plural Policy API — covering all 50 state
// legislatures, DC, Puerto Rico, and US territories. Tracks state bills,
// legislators, committees, and votes.
//
// API Docs: https://docs.openstates.org/api-v3/

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

// -- OpenStates API response types --

interface OSBill {
  id: string;
  identifier: string;
  title: string;
  classification: string[];
  subject: string[];
  session: string;
  from_organization: { name: string; classification: string };
  latest_action_date: string;
  latest_action_description: string;
  first_action_date: string;
  created_at: string;
  updated_at: string;
  openstates_url: string;
  abstracts: Array<{ abstract: string; note: string }>;
  sponsorships: Array<{
    name: string;
    entity_type: string;
    organization?: { name: string };
    person?: { id: string; name: string };
    primary: boolean;
    classification: string;
  }>;
  actions: Array<{
    date: string;
    description: string;
    classification: string[];
    organization: { name: string; classification: string };
    order: number;
  }>;
  versions: Array<{
    note: string;
    date: string;
    url: string;
    media_type: string;
  }>;
  votes: Array<{
    id: string;
    motion_text: string;
    start_date: string;
    result: string;
    organization: { name: string };
    counts: Array<{
      option: string;
      value: number;
    }>;
  }>;
  jurisdiction: {
    id: string;
    name: string;
    classification: string;
  };
}

interface OSSearchResponse {
  results: OSBill[];
  pagination: {
    per_page: number;
    page: number;
    max_page: number;
    total_items: number;
  };
}

interface OSLegislator {
  id: string;
  name: string;
  given_name: string;
  family_name: string;
  party: string;
  current_role: {
    title: string;
    org_classification: string;
    district: string;
    division_id: string;
  };
  jurisdiction: { id: string; name: string };
  openstates_url: string;
  email?: string;
  image?: string;
}

/**
 * OpenStates API Provider.
 *
 * Covers:
 * - LEGISLATION (state bills, resolutions, memorials)
 * - PERSONNEL (state legislators, committees)
 */
export class OpenStatesProvider extends BaseGovernmentProvider {
  readonly id: ProviderId = {
    slug: 'open-states',
    name: 'OpenStates / Plural Policy API',
    version: '1.0.0',
  };

  readonly capabilities: ProviderCapabilities = {
    domains: [GovernmentDomain.LEGISLATION, GovernmentDomain.PERSONNEL],
    jurisdictions: [JurisdictionLevel.STATE],
    jurisdictionCodes: [], // All US states
    supportsSearch: true,
    supportsIncrementalSync: true,
    supportsWebhooks: false,
    supportsFullText: true,
    contentFormats: [ContentFormat.HTML, ContentFormat.PDF],
    maxResultsPerQuery: 100,
    estimatedRecordCount: 5_000_000,
    features: {
      stateBills: true,
      legislators: true,
      committees: true,
      votes: true,
      billText: true,
      sponsorship: true,
      allStates: true,
    },
  };

  protected async onInitialize(): Promise<void> {
    if (!this.config.baseUrl) {
      this.config.baseUrl = 'https://v3.openstates.org';
    }
    if (!this.config.apiKey) {
      throw new ProviderError(
        'OpenStates requires an API key. Get one at https://openstates.org/accounts/profile/',
        this.id.slug,
        false,
      );
    }
  }

  private get authHeaders(): Record<string, string> {
    return { 'X-API-KEY': this.config.apiKey! };
  }

  async fetchRecord(externalId: string): Promise<GovernmentRecord> {
    const bill = await this.request<OSBill>(
      `/bills/${externalId}?include=sponsorships&include=actions&include=versions&include=votes&include=abstracts`,
      { headers: this.authHeaders },
    );
    return this.normalizeBill(bill);
  }

  async fetchRecordText(externalId: string): Promise<string> {
    const bill = await this.request<OSBill>(
      `/bills/${externalId}?include=versions`,
      { headers: this.authHeaders },
    );

    if (bill.versions?.length > 0) {
      const latest = bill.versions[bill.versions.length - 1];
      if (latest.url) {
        return this.fetchTextContent(latest.url);
      }
    }

    return bill.abstracts?.[0]?.abstract ?? bill.title;
  }

  async search(params: SearchParams): Promise<SearchResult> {
    const queryParts: string[] = [];

    if (params.query) {
      queryParts.push(`q=${encodeURIComponent(params.query)}`);
    }
    if (params.jurisdiction) {
      queryParts.push(`jurisdiction=${params.jurisdiction}`);
    }
    if (params.dateFrom) {
      queryParts.push(`created_since=${params.dateFrom}`);
    }
    if (params.dateTo) {
      queryParts.push(`updated_since=${params.dateTo}`);
    }
    if (params.subjects?.length) {
      params.subjects.forEach((s) =>
        queryParts.push(`subject=${encodeURIComponent(s)}`),
      );
    }

    const limit = params.limit ?? 20;
    const page = params.offset ? Math.floor(params.offset / limit) + 1 : 1;
    queryParts.push(`per_page=${limit}`, `page=${page}`);

    queryParts.push(
      'include=sponsorships',
      'include=actions',
      'include=abstracts',
    );

    if (params.sortBy === 'date') {
      queryParts.push(
        `sort=${params.sortOrder === 'asc' ? '' : '-'}latest_action_date`,
      );
    }

    const response = await this.request<OSSearchResponse>(
      `/bills?${queryParts.join('&')}`,
      { headers: this.authHeaders },
    );

    return {
      records: response.results.map((b) => this.normalizeBill(b)),
      total: response.pagination.total_items,
      hasMore: response.pagination.page < response.pagination.max_page,
      nextOffset:
        response.pagination.page < response.pagination.max_page
          ? page * limit
          : undefined,
    };
  }

  async fetchUpdatedSince(since: Date): Promise<GovernmentRecord[]> {
    const dateStr = since.toISOString().split('T')[0];
    const records: GovernmentRecord[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && records.length < 5000) {
      const response = await this.request<OSSearchResponse>(
        `/bills?updated_since=${dateStr}&per_page=100&page=${page}&sort=-updated_at&include=sponsorships&include=actions`,
        { headers: this.authHeaders },
      );

      records.push(...response.results.map((b) => this.normalizeBill(b)));
      hasMore = page < response.pagination.max_page;
      page++;
    }

    return records;
  }

  /**
   * Fetch legislators for a specific state.
   */
  async fetchLegislators(
    stateCode: string,
  ): Promise<GovernmentRecord[]> {
    const jurisdiction = `ocd-jurisdiction/country:us/state:${stateCode.toLowerCase()}/government`;
    const response = await this.request<{ results: OSLegislator[] }>(
      `/people?jurisdiction=${jurisdiction}&per_page=100`,
      { headers: this.authHeaders },
    );

    return response.results.map((l) => this.normalizeLegislator(l));
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      await this.request<{ results: unknown[] }>(
        '/bills?per_page=1',
        { headers: this.authHeaders },
      );
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        message: 'OpenStates API is responsive',
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

  private normalizeBill(bill: OSBill): GovernmentRecord {
    const stateCode = this.extractStateCode(bill.jurisdiction?.id);

    const sponsor = bill.sponsorships?.find((s) => s.primary);
    const coSponsors = bill.sponsorships?.filter((s) => !s.primary) ?? [];

    const author: RecordActor | undefined = sponsor
      ? {
          id: sponsor.person?.id,
          name: sponsor.name,
          role: 'primary-sponsor',
          organization: sponsor.organization?.name,
        }
      : undefined;

    const coAuthors: RecordActor[] = coSponsors.map((s) => ({
      id: s.person?.id,
      name: s.name,
      role: s.classification || 'cosponsor',
      organization: s.organization?.name,
    }));

    const actions: RecordAction[] =
      bill.actions?.map((a) => ({
        date: a.date,
        description: a.description,
        actionType: a.classification?.[0] ?? 'other',
        chamber: a.organization?.classification,
      })) ?? [];

    const textVersions =
      bill.versions?.map((v) => ({
        versionName: v.note,
        versionDate: v.date,
        format: this.mapMediaType(v.media_type),
        url: v.url,
      })) ?? [];

    return {
      externalId: bill.id,
      providerSlug: this.id.slug,
      domain: GovernmentDomain.LEGISLATION,
      jurisdiction: {
        level: JurisdictionLevel.STATE,
        code: stateCode,
        name: bill.jurisdiction?.name ?? stateCode,
        parentCode: 'US',
      },
      title: bill.title,
      identifier: bill.identifier,
      status: this.mapBillStatus(bill),
      dateIntroduced: bill.first_action_date || bill.created_at,
      dateUpdated: bill.updated_at,
      summary: bill.abstracts?.[0]?.abstract,
      textVersions,
      sourceUrls: [bill.openstates_url],
      author,
      coAuthors,
      actions,
      subjects: bill.subject ?? [],
      extensions: {
        classification: bill.classification,
        session: bill.session,
        chamber: bill.from_organization?.classification,
        latestAction: bill.latest_action_description,
        votes: bill.votes?.map((v) => ({
          motion: v.motion_text,
          date: v.start_date,
          result: v.result,
          chamber: v.organization?.name,
          counts: Object.fromEntries(
            v.counts?.map((c) => [c.option, c.value]) ?? [],
          ),
        })),
      },
    };
  }

  private normalizeLegislator(leg: OSLegislator): GovernmentRecord {
    return {
      externalId: leg.id,
      providerSlug: this.id.slug,
      domain: GovernmentDomain.PERSONNEL,
      jurisdiction: {
        level: JurisdictionLevel.STATE,
        code: this.extractStateCode(leg.jurisdiction?.id),
        name: leg.jurisdiction?.name ?? '',
        parentCode: 'US',
      },
      title: leg.name,
      identifier: `${leg.current_role?.title ?? 'Legislator'} - ${leg.name}`,
      status: RecordStatus.ACTIVE,
      dateIntroduced: '',
      dateUpdated: new Date().toISOString(),
      sourceUrls: [leg.openstates_url],
      author: {
        id: leg.id,
        name: leg.name,
        role: leg.current_role?.title ?? 'legislator',
        party: leg.party,
      },
      extensions: {
        party: leg.party,
        district: leg.current_role?.district,
        chamber: leg.current_role?.org_classification,
        email: leg.email,
        imageUrl: leg.image,
      },
    };
  }

  private extractStateCode(jurisdictionId?: string): string {
    if (!jurisdictionId) return 'US';
    const match = jurisdictionId.match(/state:(\w+)/);
    return match ? match[1].toUpperCase() : 'US';
  }

  private mapBillStatus(bill: OSBill): RecordStatus {
    const latestAction = bill.latest_action_description?.toLowerCase() ?? '';
    if (latestAction.includes('signed') || latestAction.includes('enacted')) {
      return RecordStatus.ENACTED;
    }
    if (latestAction.includes('passed')) return RecordStatus.APPROVED;
    if (latestAction.includes('vetoed')) return RecordStatus.VETOED;
    if (latestAction.includes('withdrawn')) return RecordStatus.WITHDRAWN;
    if (latestAction.includes('failed') || latestAction.includes('defeated')) {
      return RecordStatus.REJECTED;
    }
    if (latestAction.includes('committee')) return RecordStatus.UNDER_REVIEW;
    if (latestAction.includes('introduced')) return RecordStatus.PROPOSED;
    return RecordStatus.ACTIVE;
  }

  private mapMediaType(mediaType: string): ContentFormat {
    if (mediaType?.includes('html')) return ContentFormat.HTML;
    if (mediaType?.includes('pdf')) return ContentFormat.PDF;
    if (mediaType?.includes('xml')) return ContentFormat.XML;
    return ContentFormat.PLAIN_TEXT;
  }
}
