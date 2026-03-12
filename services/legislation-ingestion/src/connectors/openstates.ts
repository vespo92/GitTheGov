/**
 * OpenStates API v3 Connector
 *
 * Connects to the OpenStates/Plural Policy API to pull state-level legislation:
 * - Bills from all 50 states, DC, and Puerto Rico
 * - Sponsors with classification (author, cosponsor)
 * - Actions and vote events
 * - Bill text versions
 * - Full-text search
 *
 * API Docs: https://docs.openstates.org/api-v3/
 * Bulk Data: https://open.pluralpolicy.com/data/
 * Requires: API key from https://open.pluralpolicy.com
 */

import { BaseConnector } from './base-connector.js';
import type { ConnectorConfig, RawBillRecord, RawTextVersion, RawSponsor, RawAction, RawVoteRecord, RawIndividualVote } from '../types/index.js';
import { DataSource, Jurisdiction } from '../types/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// OpenStates API Response Types
// ─────────────────────────────────────────────────────────────────────────────

interface OpenStatesPaginatedResponse<T> {
  results: T[];
  pagination: {
    per_page: number;
    page: number;
    max_page: number;
    total_items: number;
  };
}

interface OpenStatesBill {
  id: string;
  session: string;
  identifier: string;
  title: string;
  classification: string[];
  subject: string[];
  openstates_url: string;
  legislative_session: {
    identifier: string;
    name: string;
    classification: string;
    start_date: string;
    end_date: string;
  };
  from_organization?: {
    id: string;
    name: string;
    classification: string;
  };
  first_action_date: string;
  latest_action_date: string;
  latest_action_description: string;
  latest_passage_date?: string;
  // Included when ?include=sponsorships
  sponsorships?: Array<{
    name: string;
    entity_type: string;
    organization?: { id: string; name: string };
    person?: {
      id: string;
      name: string;
      party: string;
      current_role?: {
        title: string;
        org_classification: string;
        district: string;
      };
    };
    primary: boolean;
    classification: string;
  }>;
  // Included when ?include=actions
  actions?: Array<{
    description: string;
    date: string;
    classification: string[];
    order: number;
    organization?: { id: string; name: string; classification: string };
  }>;
  // Included when ?include=versions
  versions?: Array<{
    note: string;
    date: string;
    links: Array<{ url: string; media_type: string }>;
  }>;
  // Included when ?include=votes
  votes?: Array<{
    id: string;
    identifier: string;
    motion_text: string;
    start_date: string;
    result: string;
    organization?: { id: string; name: string; classification: string };
    counts: Array<{ option: string; value: number }>;
    votes?: Array<{
      option: string;
      voter_name: string;
      voter?: { id: string; name: string };
    }>;
  }>;
  // Included when ?include=sources
  sources?: Array<{ url: string; note?: string }>;
  extras?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Connector
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://v3.openstates.org';

export class OpenStatesConnector extends BaseConnector {
  private baseUrl: string;

  constructor(config: ConnectorConfig) {
    super(DataSource.OPENSTATES, {
      ...config,
      rateLimit: config.rateLimit || 60,
      rateLimitPeriod: config.rateLimitPeriod || 60_000,
      timeout: config.timeout || 30_000,
    });
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  }

  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    try {
      await this.request(`${this.baseUrl}/jurisdictions`, {
        headers: { 'X-API-KEY': this.config.apiKey },
        params: { per_page: '1' },
      });
      return { healthy: true, message: 'OpenStates API is reachable' };
    } catch (error) {
      return {
        healthy: false,
        message: `OpenStates API unreachable: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Fetch a single bill with full details.
   * externalId: OpenStates bill ID (e.g., "ocd-bill/abc-123")
   */
  async fetchBill(externalId: string): Promise<RawBillRecord> {
    const response = await this.request<OpenStatesBill>(
      `${this.baseUrl}/bills/${externalId}`,
      {
        headers: { 'X-API-KEY': this.config.apiKey },
        params: {
          include: 'sponsorships,actions,versions,votes,sources',
        },
      }
    );

    return this.normalizeToRawBill(response);
  }

  /**
   * Fetch bill text (returns the URL — text must be fetched separately).
   */
  async fetchBillText(externalId: string): Promise<string> {
    const bill = await this.request<OpenStatesBill>(
      `${this.baseUrl}/bills/${externalId}`,
      {
        headers: { 'X-API-KEY': this.config.apiKey },
        params: { include: 'versions' },
      }
    );

    if (!bill.versions || bill.versions.length === 0) return '';

    // Get the latest version, prefer HTML
    const latest = bill.versions[0];
    const htmlLink = latest.links.find((l) => l.media_type.includes('html'));
    const textLink = latest.links.find((l) => l.media_type.includes('text'));
    const link = htmlLink || textLink;

    if (!link) return '';

    return this.fetchTextContent(link.url);
  }

  /**
   * Search for bills across states.
   */
  async searchBills(params: {
    query?: string;
    session?: string;
    state?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
    offset?: number;
    limit?: number;
  }): Promise<{ bills: RawBillRecord[]; total: number; hasMore: boolean }> {
    const apiParams: Record<string, string> = {
      per_page: String(Math.min(params.limit || 20, 50)),
      page: String(Math.floor((params.offset || 0) / 50) + 1),
      include: 'sponsorships,actions',
    };

    if (params.query) apiParams.q = params.query;
    if (params.state) apiParams.jurisdiction = params.state;
    if (params.session) apiParams.session = params.session;
    if (params.fromDate) apiParams.updated_since = params.fromDate;

    const response = await this.request<OpenStatesPaginatedResponse<OpenStatesBill>>(
      `${this.baseUrl}/bills`,
      {
        headers: { 'X-API-KEY': this.config.apiKey },
        params: apiParams,
      }
    );

    const bills = response.results.map((b) => this.normalizeToRawBill(b));

    return {
      bills,
      total: response.pagination.total_items,
      hasMore: response.pagination.page < response.pagination.max_page,
    };
  }

  /**
   * Fetch bills updated since a given date.
   */
  async fetchUpdatedBills(since: Date): Promise<RawBillRecord[]> {
    const result = await this.searchBills({
      fromDate: since.toISOString().split('T')[0],
      limit: 50,
    });
    return result.bills;
  }

  /**
   * Get bills for a specific state and session.
   */
  async getBillsByState(
    stateCode: string,
    session?: string,
    page: number = 1
  ): Promise<{ bills: RawBillRecord[]; total: number; hasMore: boolean }> {
    const jurisdiction = `ocd-jurisdiction/country:us/state:${stateCode.toLowerCase()}/government`;

    const apiParams: Record<string, string> = {
      jurisdiction,
      per_page: '50',
      page: String(page),
      include: 'sponsorships,actions',
    };

    if (session) apiParams.session = session;

    const response = await this.request<OpenStatesPaginatedResponse<OpenStatesBill>>(
      `${this.baseUrl}/bills`,
      {
        headers: { 'X-API-KEY': this.config.apiKey },
        params: apiParams,
      }
    );

    return {
      bills: response.results.map((b) => this.normalizeToRawBill(b)),
      total: response.pagination.total_items,
      hasMore: response.pagination.page < response.pagination.max_page,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private normalizeToRawBill(bill: OpenStatesBill): RawBillRecord {
    // Extract state from bill ID (ocd-bill/... format)
    const stateCode = this.extractStateCode(bill);

    // Sponsors
    const sponsors: RawSponsor[] = (bill.sponsorships || []).map((s) => ({
      name: s.name,
      firstName: s.person?.name.split(' ')[0],
      lastName: s.person?.name.split(' ').slice(1).join(' '),
      externalId: s.person?.id,
      isPrimary: s.primary,
      role: s.classification || (s.primary ? 'sponsor' : 'cosponsor'),
      party: s.person?.party,
      state: stateCode,
      district: s.person?.current_role?.district,
    }));

    // Actions
    const actions: RawAction[] = (bill.actions || []).map((a) => ({
      date: a.date,
      description: a.description,
      type: a.classification?.[0],
      chamber: a.organization?.classification,
      actor: a.organization?.name,
      order: a.order,
    }));

    // Text versions
    const textVersions: RawTextVersion[] = (bill.versions || []).map((v) => {
      const htmlLink = v.links.find((l) => l.media_type.includes('html'));
      const link = htmlLink || v.links[0];
      return {
        versionCode: v.note.toLowerCase().replace(/\s+/g, '_'),
        versionName: v.note,
        date: v.date,
        url: link?.url || '',
        format: (link?.media_type.includes('html')
          ? 'html'
          : link?.media_type.includes('pdf')
          ? 'pdf'
          : 'plain') as 'html' | 'pdf' | 'plain',
      };
    });

    // Votes
    const votes: RawVoteRecord[] = (bill.votes || []).map((v) => {
      const counts = new Map(v.counts.map((c) => [c.option, c.value]));
      return {
        externalId: v.id,
        date: v.start_date,
        chamber: v.organization?.classification,
        description: v.motion_text,
        result: v.result,
        yea: counts.get('yes') || 0,
        nay: counts.get('no') || 0,
        abstain: counts.get('other') || counts.get('abstain') || 0,
        absent: counts.get('absent') || counts.get('excused') || 0,
        individualVotes: v.votes?.map((iv) => ({
          name: iv.voter_name,
          externalId: iv.voter?.id,
          vote: this.mapVoteOption(iv.option),
        })),
      };
    });

    // Source URLs
    const sourceUrls = [bill.openstates_url];
    if (bill.sources) {
      for (const src of bill.sources) {
        sourceUrls.push(src.url);
      }
    }

    return {
      source: DataSource.OPENSTATES,
      externalId: bill.id,
      billNumber: bill.identifier,
      title: bill.title,
      billType: bill.classification?.[0] || 'bill',
      status: bill.latest_action_description,
      jurisdiction: Jurisdiction.STATE,
      stateCode,
      session: bill.legislative_session?.name || bill.session,
      chamber: bill.from_organization?.classification?.toLowerCase(),
      sponsors,
      actions,
      amendments: [], // OpenStates doesn't have a separate amendments endpoint
      votes,
      subjects: bill.subject || [],
      relatedBills: [],
      textVersions,
      sourceUrls,
      introducedDate: bill.first_action_date,
      lastActionDate: bill.latest_action_date,
    };
  }

  private extractStateCode(bill: OpenStatesBill): string {
    // Try to extract from the session or bill ID
    if (bill.legislative_session?.identifier) {
      return bill.legislative_session.identifier.split('-')[0]?.toUpperCase() || '';
    }
    return '';
  }

  private mapVoteOption(option: string): RawIndividualVote['vote'] {
    const map: Record<string, RawIndividualVote['vote']> = {
      yes: 'yea',
      no: 'nay',
      other: 'abstain',
      absent: 'absent',
      excused: 'absent',
      'not voting': 'not_voting',
    };
    return map[option.toLowerCase()] || 'abstain';
  }
}
