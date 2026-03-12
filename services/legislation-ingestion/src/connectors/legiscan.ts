/**
 * LegiScan API Connector
 *
 * Connects to the LegiScan API to pull legislation from all 50 states + Congress:
 * - Bill details, status, and history
 * - Full bill text (base64-encoded)
 * - Sponsors and their voting records
 * - Roll call votes with individual votes
 * - Amendments and supplements (fiscal notes, veto letters)
 * - Session lists and master bill lists
 *
 * API Docs: https://legiscan.com/legiscan
 * Manual: https://api.legiscan.com/dl/LegiScan_API_User_Manual.pdf
 * Rate limit: 30,000 queries/month (free), up to 250,000 (paid)
 * Requires: Free API key from https://legiscan.com/legiscan-register
 */

import { BaseConnector } from './base-connector.js';
import type { ConnectorConfig, RawBillRecord, RawTextVersion, RawSponsor, RawAction, RawAmendment, RawVoteRecord, RawIndividualVote } from '../types/index.js';
import { DataSource, Jurisdiction } from '../types/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// LegiScan API Response Types
// ─────────────────────────────────────────────────────────────────────────────

interface LegiScanResponse<T> {
  status: string;
  [key: string]: T | string;
}

interface LegiScanBill {
  bill_id: number;
  change_hash: string;
  session_id: number;
  session: { session_id: number; session_name: string; session_title: string };
  url: string;
  state_link: string;
  completed: number;
  status: number;
  status_date: string;
  progress: Array<{ date: string; event: number }>;
  state: string;
  state_id: number;
  bill_number: string;
  bill_type: string;
  bill_type_id: string;
  body: string;
  body_id: number;
  current_body: string;
  current_body_id: number;
  title: string;
  description: string;
  committee?: { committee_id: number; chamber: string; chamber_id: number; name: string };
  pending_committee_id: number;
  history: Array<{
    date: string;
    action: string;
    chamber: string;
    chamber_id: number;
    importance: number;
  }>;
  sponsors: Array<{
    people_id: number;
    person_hash: string;
    party_id: number;
    party: string;
    role_id: number;
    role: string;
    name: string;
    first_name: string;
    middle_name: string;
    last_name: string;
    suffix: string;
    nickname: string;
    district: string;
    ftm_eid: number;
    votesmart_id: number;
    opensecrets_id: string;
    ballotpedia: string;
    sponsor_type_id: number;
    sponsor_order: number;
    committee_sponsor: number;
    committee_id: number;
  }>;
  sasts: Array<{
    type_id: number;
    type: string;
    sast_bill_number: string;
    sast_bill_id: number;
  }>;
  subjects: Array<{ subject_id: number; subject_name: string }>;
  texts: Array<{
    doc_id: number;
    date: string;
    type: string;
    type_id: number;
    mime: string;
    mime_id: number;
    url: string;
    state_link: string;
    text_size: number;
  }>;
  votes: Array<{
    roll_call_id: number;
    date: string;
    desc: string;
    yea: number;
    nay: number;
    nv: number;
    absent: number;
    total: number;
    passed: number;
    chamber: string;
    chamber_id: number;
    url: string;
  }>;
  amendments: Array<{
    amendment_id: number;
    adopted: number;
    chamber: string;
    chamber_id: number;
    date: string;
    title: string;
    description: string;
    mime: string;
    mime_id: number;
    url: string;
    state_link: string;
  }>;
  supplements: Array<{
    supplement_id: number;
    date: string;
    type_id: number;
    type: string;
    title: string;
    description: string;
    mime: string;
    mime_id: number;
    url: string;
    state_link: string;
  }>;
  calendar: Array<{
    date: string;
    type_id: number;
    type: string;
    location: string;
    description: string;
  }>;
}

interface LegiScanBillTextResponse {
  text: {
    doc_id: number;
    bill_id: number;
    date: string;
    type: string;
    type_id: number;
    mime: string;
    mime_id: number;
    text_size: number;
    text_hash: string;
    doc: string; // base64-encoded text content
  };
}

interface LegiScanRollCallResponse {
  roll_call: {
    roll_call_id: number;
    bill_id: number;
    date: string;
    desc: string;
    yea: number;
    nay: number;
    nv: number;
    absent: number;
    total: number;
    passed: number;
    chamber: string;
    chamber_id: number;
    votes: Array<{
      people_id: number;
      vote_id: number;
      vote_text: string;
    }>;
  };
}

interface LegiScanSearchResponse {
  searchresult: {
    summary: {
      page: number;
      range: string;
      relevance: number;
      count: number;
      page_current: number;
      page_total: number;
    };
    [key: string]: unknown;
  };
}

interface LegiScanSearchResult {
  relevance: number;
  state: string;
  bill_number: string;
  bill_id: number;
  change_hash: string;
  url: string;
  text_url: string;
  last_action_date: string;
  last_action: string;
  title: string;
}

interface LegiScanSessionListResponse {
  sessions: Array<{
    session_id: number;
    state_id: number;
    year_start: number;
    year_end: number;
    special: number;
    session_name: string;
    session_title: string;
    session_tag: string;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Connector
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://api.legiscan.com';

export class LegiScanConnector extends BaseConnector {
  private baseUrl: string;

  constructor(config: ConnectorConfig) {
    super(DataSource.LEGISCAN, {
      ...config,
      // Free tier: 30,000/month ≈ ~42/hour ≈ 0.7/min
      // Be conservative to stay under limits
      rateLimit: config.rateLimit || 30,
      rateLimitPeriod: config.rateLimitPeriod || 60_000,
      timeout: config.timeout || 30_000,
    });
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  }

  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    try {
      await this.request(`${this.baseUrl}/`, {
        params: { key: this.config.apiKey, op: 'getSessionList', state: 'US' },
      });
      return { healthy: true, message: 'LegiScan API is reachable' };
    } catch (error) {
      return {
        healthy: false,
        message: `LegiScan API unreachable: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Fetch a single bill by LegiScan bill_id.
   */
  async fetchBill(externalId: string): Promise<RawBillRecord> {
    const response = await this.request<LegiScanResponse<LegiScanBill>>(
      `${this.baseUrl}/`,
      {
        params: { key: this.config.apiKey, op: 'getBill', id: externalId },
      }
    );

    const bill = response.bill as LegiScanBill;
    return this.normalizeToRawBill(bill);
  }

  /**
   * Fetch the decoded text of a bill.
   */
  async fetchBillText(externalId: string): Promise<string> {
    const response = await this.request<LegiScanBillTextResponse>(
      `${this.baseUrl}/`,
      {
        params: { key: this.config.apiKey, op: 'getBillText', id: externalId },
      }
    );

    if (!response.text?.doc) return '';

    // LegiScan returns base64-encoded content
    return Buffer.from(response.text.doc, 'base64').toString('utf-8');
  }

  /**
   * Fetch detailed roll call votes for a bill.
   */
  async fetchRollCall(rollCallId: string): Promise<RawVoteRecord> {
    const response = await this.request<LegiScanRollCallResponse>(
      `${this.baseUrl}/`,
      {
        params: { key: this.config.apiKey, op: 'getRollCall', id: rollCallId },
      }
    );

    const rc = response.roll_call;
    return {
      externalId: String(rc.roll_call_id),
      date: rc.date,
      chamber: rc.chamber,
      description: rc.desc,
      result: rc.passed ? 'passed' : 'failed',
      yea: rc.yea,
      nay: rc.nay,
      abstain: rc.nv,
      absent: rc.absent,
      individualVotes: rc.votes.map((v) => ({
        name: String(v.people_id),
        externalId: String(v.people_id),
        vote: this.mapVoteText(v.vote_text),
      })),
    };
  }

  /**
   * Search for bills across all states or a specific state.
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
    const searchParams: Record<string, string> = {
      key: this.config.apiKey,
      op: 'search',
    };

    if (params.query) searchParams.query = params.query;
    if (params.state) searchParams.state = params.state;
    if (params.session) searchParams.id = params.session;
    if (params.offset) searchParams.page = String(Math.floor(params.offset / 50) + 1);

    const response = await this.request<LegiScanSearchResponse>(
      `${this.baseUrl}/`,
      { params: searchParams }
    );

    const results = response.searchresult;
    const summary = results.summary as LegiScanSearchResponse['searchresult']['summary'];
    const bills: RawBillRecord[] = [];

    // Results are indexed by number (0, 1, 2, ...)
    for (const [key, value] of Object.entries(results)) {
      if (key === 'summary') continue;
      const result = value as LegiScanSearchResult;
      if (result.bill_id) {
        bills.push(this.searchResultToRawBill(result));
      }
    }

    return {
      bills,
      total: summary.count,
      hasMore: summary.page_current < summary.page_total,
    };
  }

  /**
   * Fetch bills updated since a given date using search.
   */
  async fetchUpdatedBills(since: Date): Promise<RawBillRecord[]> {
    // LegiScan search supports year filtering
    const result = await this.searchBills({
      query: '*',
      fromDate: since.toISOString().split('T')[0],
    });
    return result.bills;
  }

  /**
   * Get available legislative sessions for a state.
   */
  async getSessionList(stateCode: string): Promise<LegiScanSessionListResponse['sessions']> {
    const response = await this.request<LegiScanSessionListResponse>(
      `${this.baseUrl}/`,
      {
        params: { key: this.config.apiKey, op: 'getSessionList', state: stateCode },
      }
    );
    return response.sessions;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private normalizeToRawBill(bill: LegiScanBill): RawBillRecord {
    const jurisdiction = bill.state === 'US' ? Jurisdiction.FEDERAL : Jurisdiction.STATE;

    // Sponsors
    const sponsors: RawSponsor[] = bill.sponsors.map((s) => ({
      name: `${s.first_name} ${s.last_name}`.trim(),
      firstName: s.first_name,
      lastName: s.last_name,
      externalId: String(s.people_id),
      isPrimary: s.sponsor_order === 1,
      role: s.sponsor_type_id === 1 ? 'sponsor' : 'cosponsor',
      party: s.party,
      state: bill.state,
      district: s.district,
    }));

    // Actions from history
    const actions: RawAction[] = bill.history.map((h, i) => ({
      date: h.date,
      description: h.action,
      chamber: h.chamber,
      order: i,
    }));

    // Amendments
    const amendments: RawAmendment[] = bill.amendments.map((a) => ({
      externalId: String(a.amendment_id),
      title: a.title || a.description,
      status: a.adopted ? 'adopted' : 'proposed',
      proposedDate: a.date,
      chamber: a.chamber,
      url: a.url,
    }));

    // Votes
    const votes: RawVoteRecord[] = bill.votes.map((v) => ({
      externalId: String(v.roll_call_id),
      date: v.date,
      chamber: v.chamber,
      description: v.desc,
      result: v.passed ? 'passed' : 'failed',
      yea: v.yea,
      nay: v.nay,
      abstain: v.nv,
      absent: v.absent,
    }));

    // Text versions
    const textVersions: RawTextVersion[] = bill.texts.map((t) => ({
      versionCode: String(t.type_id),
      versionName: t.type,
      date: t.date,
      url: t.url,
      format: t.mime.includes('html')
        ? ('html' as const)
        : t.mime.includes('pdf')
        ? ('pdf' as const)
        : ('plain' as const),
    }));

    // Subjects
    const subjects = bill.subjects.map((s) => s.subject_name);

    // Related bills (same-as bills)
    const relatedBills = bill.sasts.map((s) => String(s.sast_bill_id));

    return {
      source: DataSource.LEGISCAN,
      externalId: String(bill.bill_id),
      billNumber: bill.bill_number,
      title: bill.title,
      shortTitle: bill.description !== bill.title ? bill.description : undefined,
      billType: bill.bill_type,
      status: this.mapLegiScanStatus(bill.status),
      jurisdiction,
      stateCode: bill.state !== 'US' ? bill.state : undefined,
      session: bill.session.session_name,
      chamber: bill.body?.toLowerCase(),
      sponsors,
      actions,
      amendments,
      votes,
      subjects,
      relatedBills,
      textVersions,
      sourceUrls: [bill.url, bill.state_link].filter(Boolean),
      introducedDate: bill.history[0]?.date || bill.status_date,
      lastActionDate: bill.status_date,
    };
  }

  private searchResultToRawBill(result: LegiScanSearchResult): RawBillRecord {
    return {
      source: DataSource.LEGISCAN,
      externalId: String(result.bill_id),
      billNumber: result.bill_number,
      title: result.title,
      billType: '',
      status: result.last_action,
      jurisdiction: result.state === 'US' ? Jurisdiction.FEDERAL : Jurisdiction.STATE,
      stateCode: result.state !== 'US' ? result.state : undefined,
      session: '',
      sponsors: [],
      actions: [{ date: result.last_action_date, description: result.last_action }],
      amendments: [],
      votes: [],
      subjects: [],
      relatedBills: [],
      textVersions: [],
      sourceUrls: [result.url].filter(Boolean),
      introducedDate: result.last_action_date,
      lastActionDate: result.last_action_date,
    };
  }

  private mapLegiScanStatus(statusCode: number): string {
    const statuses: Record<number, string> = {
      0: 'N/A',
      1: 'Introduced',
      2: 'Engrossed',
      3: 'Enrolled',
      4: 'Passed',
      5: 'Vetoed',
      6: 'Failed',
    };
    return statuses[statusCode] || 'Unknown';
  }

  private mapVoteText(voteText: string): RawIndividualVote['vote'] {
    const map: Record<string, RawIndividualVote['vote']> = {
      Yea: 'yea',
      Nay: 'nay',
      NV: 'not_voting',
      Absent: 'absent',
    };
    return map[voteText] || 'abstain';
  }
}
