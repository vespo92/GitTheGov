/**
 * GovInfo (GPO) API Connector
 *
 * Connects to the Government Publishing Office's GovInfo API to pull:
 * - Full bill text in XML and HTML formats
 * - Bill status and metadata
 * - Related documents (committee reports, public laws, signing statements)
 * - Bulk data downloads for historical legislation
 *
 * API Docs: https://api.govinfo.gov/docs/
 * GitHub: https://github.com/usgpo/api
 * Rate limit: Reasonable use (no hard published limit)
 * Requires: api.data.gov API key (free)
 */

import { BaseConnector } from './base-connector.js';
import type { ConnectorConfig, RawBillRecord, RawTextVersion, RawAction } from '../types/index.js';
import { DataSource, Jurisdiction } from '../types/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// GovInfo API Response Types
// ─────────────────────────────────────────────────────────────────────────────

interface GovInfoCollectionResponse {
  packages: GovInfoPackageSummary[];
  nextPage?: string;
  count: number;
  offsetMark?: string;
  message?: string;
}

interface GovInfoPackageSummary {
  packageId: string;
  lastModified: string;
  packageLink: string;
  docClass: string;
  title: string;
  congress: string;
  dateIssued: string;
}

interface GovInfoPackageDetail {
  packageId: string;
  title: string;
  congress: string;
  session: string;
  chamber?: string;
  billNumber?: string;
  billType?: string;
  billVersion?: string;
  dateIssued: string;
  lastModified: string;
  category: string;
  docClass: string;
  download?: {
    txtLink?: string;
    xmlLink?: string;
    pdfLink?: string;
    htmLink?: string;
    modsLink?: string;
    premisLink?: string;
  };
  related?: {
    billStatusLink?: string;
  };
  otherIdentifier?: {
    congress?: string;
    session?: string;
    chamber?: string;
  };
  members?: Array<{
    memberName: string;
    role: string;
    chamber: string;
    congress: string;
    state: string;
    party: string;
    bioGuideId: string;
  }>;
}

interface GovInfoRelatedResponse {
  count: number;
  relationships: Array<{
    relationshipType: string;
    relatedPackages: Array<{
      packageId: string;
      packageLink: string;
      title: string;
      docClass: string;
      dateIssued: string;
    }>;
  }>;
}

interface GovInfoPublishedResponse {
  packages: GovInfoPackageSummary[];
  count: number;
  nextPage?: string;
  offsetMark?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Connector
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://api.govinfo.gov';

export class GovInfoConnector extends BaseConnector {
  private baseUrl: string;

  constructor(config: ConnectorConfig) {
    super(DataSource.GOVINFO, {
      ...config,
      rateLimit: config.rateLimit || 60,
      rateLimitPeriod: config.rateLimitPeriod || 60_000,
      timeout: config.timeout || 30_000,
    });
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  }

  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    try {
      await this.request(`${this.baseUrl}/collections`, {
        params: { api_key: this.config.apiKey },
      });
      return { healthy: true, message: 'GovInfo API is reachable' };
    } catch (error) {
      return {
        healthy: false,
        message: `GovInfo API unreachable: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Fetch a single bill package by its GovInfo package ID.
   * externalId format: "BILLS-118hr1234ih" (packageId)
   */
  async fetchBill(externalId: string): Promise<RawBillRecord> {
    const detail = await this.request<GovInfoPackageDetail>(
      `${this.baseUrl}/packages/${externalId}/summary`,
      { params: { api_key: this.config.apiKey } }
    );

    // Fetch related documents
    let related: GovInfoRelatedResponse | null = null;
    try {
      related = await this.request<GovInfoRelatedResponse>(
        `${this.baseUrl}/related/${externalId}`,
        { params: { api_key: this.config.apiKey } }
      );
    } catch {
      // Related docs may not be available for all packages
    }

    return this.normalizeToRawBill(detail, related);
  }

  /**
   * Fetch the plain text content of a bill.
   */
  async fetchBillText(externalId: string): Promise<string> {
    const detail = await this.request<GovInfoPackageDetail>(
      `${this.baseUrl}/packages/${externalId}/summary`,
      { params: { api_key: this.config.apiKey } }
    );

    const textUrl = detail.download?.htmLink || detail.download?.txtLink;
    if (!textUrl) return '';

    return this.fetchTextContent(`${textUrl}?api_key=${this.config.apiKey}`);
  }

  /**
   * Search for bills in the BILLS collection.
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
    const fromDate = params.fromDate || '2023-01-01';
    const pageSize = Math.min(params.limit || 20, 100);

    const apiParams: Record<string, string> = {
      api_key: this.config.apiKey,
      pageSize: String(pageSize),
      offsetMark: params.offset ? String(params.offset) : '*',
    };

    // Use the collections endpoint to get BILLS
    const startDate = `${fromDate}T00:00:00Z`;
    const response = await this.request<GovInfoCollectionResponse>(
      `${this.baseUrl}/collections/BILLS/${startDate}`,
      { params: apiParams }
    );

    const bills: RawBillRecord[] = response.packages.map((pkg) =>
      this.summaryToRawBill(pkg)
    );

    return {
      bills,
      total: response.count,
      hasMore: !!response.nextPage,
    };
  }

  /**
   * Fetch bills published since a given date.
   */
  async fetchUpdatedBills(since: Date): Promise<RawBillRecord[]> {
    const fromDate = since.toISOString().split('T')[0];
    const toDate = new Date().toISOString().split('T')[0];

    const response = await this.request<GovInfoPublishedResponse>(
      `${this.baseUrl}/published/${fromDate}/${toDate}`,
      {
        params: {
          api_key: this.config.apiKey,
          collection: 'BILLS',
          pageSize: '100',
          offsetMark: '*',
        },
      }
    );

    return response.packages.map((pkg) => this.summaryToRawBill(pkg));
  }

  /**
   * Fetch related documents for a bill (committee reports, public laws, etc.)
   * This is key for tracking the full legislative lifecycle.
   */
  async fetchRelatedDocuments(packageId: string): Promise<GovInfoRelatedResponse> {
    return this.request<GovInfoRelatedResponse>(
      `${this.baseUrl}/related/${packageId}`,
      { params: { api_key: this.config.apiKey } }
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private normalizeToRawBill(
    detail: GovInfoPackageDetail,
    related: GovInfoRelatedResponse | null
  ): RawBillRecord {
    // Parse packageId to extract bill info
    // Format: BILLS-{congress}{type}{number}{version}
    const billMatch = detail.packageId.match(/BILLS-(\d+)([a-z]+)(\d+)([a-z]+)/i);
    const congress = billMatch?.[1] || detail.congress;
    const billType = billMatch?.[2] || detail.billType || '';
    const billNum = billMatch?.[3] || detail.billNumber || '';
    const version = billMatch?.[4] || detail.billVersion || '';

    const textVersions: RawTextVersion[] = [];
    if (detail.download) {
      if (detail.download.htmLink) {
        textVersions.push({
          versionCode: version,
          versionName: this.expandVersionCode(version),
          date: detail.dateIssued,
          url: detail.download.htmLink,
          format: 'html',
        });
      }
      if (detail.download.xmlLink) {
        textVersions.push({
          versionCode: `${version}_xml`,
          versionName: `${this.expandVersionCode(version)} (XML)`,
          date: detail.dateIssued,
          url: detail.download.xmlLink,
          format: 'xml',
        });
      }
    }

    // Build sponsors from members
    const sponsors = (detail.members || []).map((m) => ({
      name: m.memberName,
      bioguideId: m.bioGuideId,
      externalId: m.bioGuideId,
      isPrimary: m.role.toLowerCase().includes('sponsor'),
      role: m.role.toLowerCase(),
      party: m.party,
      state: m.state,
    }));

    // Build source URLs for related documents
    const sourceUrls = [
      `https://www.govinfo.gov/app/details/${detail.packageId}`,
    ];
    if (related) {
      for (const rel of related.relationships) {
        for (const pkg of rel.relatedPackages) {
          sourceUrls.push(`https://www.govinfo.gov/app/details/${pkg.packageId}`);
        }
      }
    }

    return {
      source: DataSource.GOVINFO,
      externalId: detail.packageId,
      billNumber: `${billType.toUpperCase()} ${billNum}`,
      title: detail.title,
      billType,
      status: version ? this.expandVersionCode(version) : 'unknown',
      jurisdiction: Jurisdiction.FEDERAL,
      session: congress,
      chamber: detail.chamber?.toLowerCase(),
      sponsors,
      actions: [
        {
          date: detail.dateIssued,
          description: `Published as ${this.expandVersionCode(version)}`,
          type: 'publication',
        },
      ],
      amendments: [],
      votes: [],
      subjects: [],
      relatedBills: [],
      textVersions,
      sourceUrls,
      introducedDate: detail.dateIssued,
      lastActionDate: detail.lastModified,
    };
  }

  private summaryToRawBill(pkg: GovInfoPackageSummary): RawBillRecord {
    return {
      source: DataSource.GOVINFO,
      externalId: pkg.packageId,
      billNumber: pkg.title,
      title: pkg.title,
      billType: pkg.docClass,
      status: 'published',
      jurisdiction: Jurisdiction.FEDERAL,
      session: pkg.congress,
      sponsors: [],
      actions: [
        { date: pkg.dateIssued, description: 'Published on GovInfo' },
      ],
      amendments: [],
      votes: [],
      subjects: [],
      relatedBills: [],
      textVersions: [],
      sourceUrls: [pkg.packageLink],
      introducedDate: pkg.dateIssued,
      lastActionDate: pkg.lastModified,
    };
  }

  /** Expand bill version codes to human-readable names */
  private expandVersionCode(code: string): string {
    const codes: Record<string, string> = {
      ih: 'Introduced in House',
      is: 'Introduced in Senate',
      rh: 'Reported in House',
      rs: 'Reported in Senate',
      eh: 'Engrossed in House',
      es: 'Engrossed in Senate',
      enr: 'Enrolled Bill',
      pcs: 'Placed on Calendar Senate',
      pch: 'Placed on Calendar House',
      ath: 'Agreed to by House',
      ats: 'Agreed to by Senate',
      cps: 'Considered and Passed Senate',
      cph: 'Considered and Passed House',
      rfh: 'Referred in House',
      rfs: 'Referred in Senate',
      pp: 'Public Print',
      eas: 'Engrossed Amendment Senate',
      eah: 'Engrossed Amendment House',
    };
    return codes[code.toLowerCase()] || code.toUpperCase();
  }
}
