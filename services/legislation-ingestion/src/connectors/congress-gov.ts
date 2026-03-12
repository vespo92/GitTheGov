/**
 * Congress.gov API Connector
 *
 * Connects to the Library of Congress Congress.gov API (v3) to pull:
 * - Federal bills, resolutions, joint resolutions
 * - Full bill text (all versions)
 * - Sponsors and cosponsors (with Bioguide IDs)
 * - Amendments and their sponsors
 * - Actions (committee referrals, floor votes, presidential action)
 * - Related bills and subjects
 *
 * API Docs: https://github.com/LibraryOfCongress/api.congress.gov
 * Rate limit: 5,000 requests/hour
 * Requires: API key from https://api.congress.gov/sign-up/
 */

import { BaseConnector } from './base-connector.js';
import type { ConnectorConfig, RawBillRecord, RawTextVersion, RawSponsor, RawAction, RawAmendment, RawVoteRecord } from '../types/index.js';
import { DataSource, Jurisdiction } from '../types/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Congress.gov API Response Types
// ─────────────────────────────────────────────────────────────────────────────

interface CongressBillListResponse {
  bills: CongressBillSummary[];
  pagination: {
    count: number;
    next?: string;
  };
}

interface CongressBillSummary {
  congress: number;
  type: string;
  number: number;
  title: string;
  originChamber: string;
  latestAction?: {
    actionDate: string;
    text: string;
  };
  url: string;
  updateDate: string;
}

interface CongressBillDetailResponse {
  bill: CongressBillDetail;
}

interface CongressBillDetail {
  congress: number;
  type: string;
  number: number;
  title: string;
  titles: Array<{ title: string; titleType: string }>;
  introducedDate: string;
  updateDate: string;
  originChamber: string;
  originChamberCode: string;
  latestAction?: { actionDate: string; text: string };
  sponsors: Array<{
    bioguideId: string;
    fullName: string;
    firstName: string;
    lastName: string;
    middleName?: string;
    party: string;
    state: string;
    district?: number;
    isByRequest: string;
  }>;
  cosponsors?: { count: number; url: string };
  actions?: { count: number; url: string };
  amendments?: { count: number; url: string };
  textVersions?: { count: number; url: string };
  subjects?: { url: string };
  relatedBills?: { count: number; url: string };
  policyArea?: { name: string };
  summaries?: { count: number; url: string };
}

interface CongressCosponsorsResponse {
  cosponsors: Array<{
    bioguideId: string;
    fullName: string;
    firstName: string;
    lastName: string;
    party: string;
    state: string;
    district?: number;
    sponsorshipDate: string;
    sponsorshipWithdrawnDate?: string;
  }>;
}

interface CongressActionsResponse {
  actions: Array<{
    actionDate: string;
    text: string;
    type: string;
    actionCode?: string;
    sourceSystem?: { code: number; name: string };
    committees?: Array<{ name: string; systemCode: string }>;
  }>;
}

interface CongressAmendmentsResponse {
  amendments: Array<{
    congress: number;
    type: string;
    number: string;
    description?: string;
    purpose?: string;
    latestAction?: { actionDate: string; text: string };
    sponsors?: Array<{
      bioguideId: string;
      fullName: string;
      party: string;
      state: string;
    }>;
    url: string;
  }>;
}

interface CongressTextVersionsResponse {
  textVersions: Array<{
    date: string | null;
    type: string;
    formats: Array<{
      type: string;
      url: string;
    }>;
  }>;
}

interface CongressSubjectsResponse {
  subjects: {
    legislativeSubjects: Array<{ name: string }>;
    policyArea?: { name: string };
  };
}

interface CongressRelatedBillsResponse {
  relatedBills: Array<{
    congress: number;
    type: string;
    number: number;
    title: string;
    relationshipDetails: Array<{ type: string; identifiedBy: string }>;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Connector
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://api.congress.gov/v3';

export class CongressGovConnector extends BaseConnector {
  private baseUrl: string;

  constructor(config: ConnectorConfig) {
    super(DataSource.CONGRESS_GOV, {
      ...config,
      rateLimit: config.rateLimit || 80, // ~5000/hr ≈ 83/min, keep buffer
      rateLimitPeriod: config.rateLimitPeriod || 60_000,
      timeout: config.timeout || 30_000,
    });
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  }

  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    try {
      await this.request(`${this.baseUrl}/bill`, {
        params: { api_key: this.config.apiKey, limit: '1' },
      });
      return { healthy: true, message: 'Congress.gov API is reachable' };
    } catch (error) {
      return {
        healthy: false,
        message: `Congress.gov API unreachable: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Fetch a single bill with all associated data.
   * externalId format: "{congress}/{type}/{number}" e.g., "118/hr/1234"
   */
  async fetchBill(externalId: string): Promise<RawBillRecord> {
    const [congress, type, number] = externalId.split('/');
    const billUrl = `${this.baseUrl}/bill/${congress}/${type}/${number}`;
    const apiParams = { api_key: this.config.apiKey };

    // Fetch bill detail
    const detail = await this.request<CongressBillDetailResponse>(billUrl, {
      params: apiParams,
    });

    // Fetch associated data in parallel
    const [cosponsors, actions, amendments, textVersions, subjects, relatedBills] =
      await Promise.all([
        detail.bill.cosponsors?.url
          ? this.request<CongressCosponsorsResponse>(detail.bill.cosponsors.url, {
              params: { ...apiParams, limit: '250' },
            }).catch(() => ({ cosponsors: [] }))
          : Promise.resolve({ cosponsors: [] }),
        detail.bill.actions?.url
          ? this.request<CongressActionsResponse>(detail.bill.actions.url, {
              params: { ...apiParams, limit: '250' },
            }).catch(() => ({ actions: [] }))
          : Promise.resolve({ actions: [] }),
        detail.bill.amendments?.url
          ? this.request<CongressAmendmentsResponse>(detail.bill.amendments.url, {
              params: { ...apiParams, limit: '250' },
            }).catch(() => ({ amendments: [] }))
          : Promise.resolve({ amendments: [] }),
        detail.bill.textVersions?.url
          ? this.request<CongressTextVersionsResponse>(detail.bill.textVersions.url, {
              params: apiParams,
            }).catch(() => ({ textVersions: [] }))
          : Promise.resolve({ textVersions: [] }),
        detail.bill.subjects?.url
          ? this.request<CongressSubjectsResponse>(detail.bill.subjects.url, {
              params: apiParams,
            }).catch(() => ({ subjects: { legislativeSubjects: [] } }))
          : Promise.resolve({ subjects: { legislativeSubjects: [] } }),
        detail.bill.relatedBills?.url
          ? this.request<CongressRelatedBillsResponse>(detail.bill.relatedBills.url, {
              params: { ...apiParams, limit: '250' },
            }).catch(() => ({ relatedBills: [] }))
          : Promise.resolve({ relatedBills: [] }),
      ]);

    return this.normalizeToRawBill(
      detail.bill,
      cosponsors.cosponsors,
      actions.actions,
      amendments.amendments,
      textVersions.textVersions,
      subjects.subjects,
      relatedBills.relatedBills
    );
  }

  /**
   * Fetch the plain-text content of a bill's latest text version.
   */
  async fetchBillText(externalId: string): Promise<string> {
    const [congress, type, number] = externalId.split('/');
    const textUrl = `${this.baseUrl}/bill/${congress}/${type}/${number}/text`;

    const response = await this.request<CongressTextVersionsResponse>(textUrl, {
      params: { api_key: this.config.apiKey },
    });

    if (!response.textVersions || response.textVersions.length === 0) {
      return '';
    }

    // Get the latest text version, prefer HTML format for text extraction
    const latest = response.textVersions[0];
    const htmlFormat = latest.formats.find((f) => f.type === 'Formatted Text as HTML');
    const txtFormat = latest.formats.find((f) => f.type === 'Formatted Text');

    const textUrl2 = htmlFormat?.url || txtFormat?.url;
    if (!textUrl2) return '';

    return this.fetchTextContent(textUrl2);
  }

  /**
   * Search for bills by query string and filters.
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
    const congress = params.session || '119'; // Current congress
    const limit = Math.min(params.limit || 20, 250);

    const apiParams: Record<string, string> = {
      api_key: this.config.apiKey,
      limit: String(limit),
      offset: String(params.offset || 0),
    };

    if (params.fromDate) apiParams.fromDateTime = `${params.fromDate}T00:00:00Z`;
    if (params.toDate) apiParams.toDateTime = `${params.toDate}T23:59:59Z`;

    const response = await this.request<CongressBillListResponse>(
      `${this.baseUrl}/bill/${congress}`,
      { params: apiParams }
    );

    // For each summary, we need to fetch the full detail
    // But for listing purposes, return lightweight records
    const bills: RawBillRecord[] = response.bills.map((summary) =>
      this.summaryToRawBill(summary)
    );

    return {
      bills,
      total: response.pagination.count,
      hasMore: !!response.pagination.next,
    };
  }

  /**
   * Fetch bills updated since a given date.
   */
  async fetchUpdatedBills(since: Date): Promise<RawBillRecord[]> {
    const fromDate = since.toISOString().split('T')[0];
    const result = await this.searchBills({
      fromDate,
      limit: 250,
    });
    return result.bills;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private normalizeToRawBill(
    bill: CongressBillDetail,
    cosponsors: CongressCosponsorsResponse['cosponsors'],
    actions: CongressActionsResponse['actions'],
    amendments: CongressAmendmentsResponse['amendments'],
    textVersions: CongressTextVersionsResponse['textVersions'],
    subjects: CongressSubjectsResponse['subjects'],
    relatedBills: CongressRelatedBillsResponse['relatedBills']
  ): RawBillRecord {
    const billNumber = `${bill.type.toUpperCase()} ${bill.number}`;
    const externalId = `${bill.congress}/${bill.type.toLowerCase()}/${bill.number}`;

    // Build sponsors list
    const sponsors: RawSponsor[] = bill.sponsors.map((s) => ({
      name: s.fullName,
      firstName: s.firstName,
      lastName: s.lastName,
      externalId: s.bioguideId,
      bioguideId: s.bioguideId,
      isPrimary: true,
      role: 'sponsor',
      party: s.party,
      state: s.state,
      district: s.district?.toString(),
    }));

    // Add cosponsors
    for (const cs of cosponsors) {
      sponsors.push({
        name: cs.fullName,
        firstName: cs.firstName,
        lastName: cs.lastName,
        externalId: cs.bioguideId,
        bioguideId: cs.bioguideId,
        isPrimary: false,
        role: 'cosponsor',
        party: cs.party,
        state: cs.state,
        district: cs.district?.toString(),
        sponsoredDate: cs.sponsorshipDate,
        withdrawnDate: cs.sponsorshipWithdrawnDate,
      });
    }

    // Build actions
    const rawActions: RawAction[] = actions.map((a, i) => ({
      date: a.actionDate,
      description: a.text,
      type: a.type,
      chamber: a.sourceSystem?.name,
      actor: a.committees?.map((c) => c.name).join(', '),
      order: i,
    }));

    // Build amendments
    const rawAmendments: RawAmendment[] = amendments.map((a) => ({
      externalId: `${a.congress}/${a.type}/${a.number}`,
      number: a.number,
      title: a.purpose || a.description || `Amendment ${a.number}`,
      status: a.latestAction?.text || 'unknown',
      proposedDate: a.latestAction?.actionDate || bill.introducedDate,
      sponsor: a.sponsors?.[0]
        ? {
            name: a.sponsors[0].fullName,
            bioguideId: a.sponsors[0].bioguideId,
            isPrimary: true,
            role: 'sponsor',
            party: a.sponsors[0].party,
            state: a.sponsors[0].state,
          }
        : undefined,
      url: a.url,
    }));

    // Build text versions
    const rawTextVersions: RawTextVersion[] = textVersions.map((tv) => {
      const htmlFormat = tv.formats.find((f) => f.type === 'Formatted Text as HTML');
      const txtFormat = tv.formats.find((f) => f.type === 'Formatted Text');
      const xmlFormat = tv.formats.find((f) => f.type === 'XML');

      return {
        versionCode: tv.type.toLowerCase().replace(/\s+/g, '_'),
        versionName: tv.type,
        date: tv.date || bill.introducedDate,
        url: htmlFormat?.url || txtFormat?.url || xmlFormat?.url || '',
        format: (htmlFormat ? 'html' : txtFormat ? 'plain' : 'xml') as 'html' | 'plain' | 'xml',
      };
    });

    // Build subjects
    const subjectNames = subjects.legislativeSubjects?.map((s) => s.name) || [];
    if (subjects.policyArea?.name) {
      subjectNames.unshift(subjects.policyArea.name);
    }

    // Build related bills
    const relatedBillIds = relatedBills.map(
      (rb) => `${rb.congress}/${rb.type.toLowerCase()}/${rb.number}`
    );

    return {
      source: DataSource.CONGRESS_GOV,
      externalId,
      billNumber,
      title: bill.title,
      shortTitle: bill.titles?.find((t) => t.titleType === 'Short Title(s) as Introduced')?.title,
      billType: bill.type,
      status: bill.latestAction?.text || 'unknown',
      jurisdiction: Jurisdiction.FEDERAL,
      session: String(bill.congress),
      chamber: bill.originChamber?.toLowerCase(),
      sponsors,
      actions: rawActions,
      amendments: rawAmendments,
      votes: [], // Votes come from separate roll call endpoints
      subjects: subjectNames,
      relatedBills: relatedBillIds,
      textVersions: rawTextVersions,
      sourceUrls: [`https://www.congress.gov/bill/${bill.congress}th-congress/${bill.type.toLowerCase()}-bill/${bill.number}`],
      introducedDate: bill.introducedDate,
      lastActionDate: bill.latestAction?.actionDate || bill.updateDate,
    };
  }

  private summaryToRawBill(summary: CongressBillSummary): RawBillRecord {
    const externalId = `${summary.congress}/${summary.type.toLowerCase()}/${summary.number}`;
    return {
      source: DataSource.CONGRESS_GOV,
      externalId,
      billNumber: `${summary.type.toUpperCase()} ${summary.number}`,
      title: summary.title,
      billType: summary.type,
      status: summary.latestAction?.text || 'unknown',
      jurisdiction: Jurisdiction.FEDERAL,
      session: String(summary.congress),
      chamber: summary.originChamber?.toLowerCase(),
      sponsors: [],
      actions: summary.latestAction
        ? [{ date: summary.latestAction.actionDate, description: summary.latestAction.text }]
        : [],
      amendments: [],
      votes: [],
      subjects: [],
      relatedBills: [],
      textVersions: [],
      sourceUrls: [summary.url],
      introducedDate: summary.updateDate,
      lastActionDate: summary.latestAction?.actionDate || summary.updateDate,
    };
  }
}
