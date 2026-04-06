// ============================================================================
// Federal Register Provider
// ============================================================================
// Connects to the Federal Register API (federalregister.gov) — the official
// daily publication for rules, proposed rules, executive orders, notices,
// and presidential documents from the US federal government.
//
// API Docs: https://www.federalregister.gov/developers/documentation/api/v1

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

// -- Federal Register API response types --

interface FRDocument {
  document_number: string;
  title: string;
  type: 'Rule' | 'Proposed Rule' | 'Notice' | 'Presidential Document';
  subtype?: string; // 'Executive Order', 'Proclamation', 'Memorandum'
  abstract?: string;
  action?: string;
  dates?: string;
  body_html_url?: string;
  full_text_xml_url?: string;
  raw_text_url?: string;
  html_url: string;
  pdf_url: string;
  public_inspection_pdf_url?: string;
  publication_date: string;
  signing_date?: string;
  effective_on?: string;
  comments_close_on?: string;
  agencies: Array<{
    id: number;
    name: string;
    slug: string;
    parent_id?: number;
  }>;
  docket_ids: string[];
  regulation_id_numbers: string[];
  cfr_references: Array<{
    title: number;
    part: number;
  }>;
  topics: string[];
  significant?: boolean;
  executive_order_number?: number;
  presidential_document_type_id?: number;
  disposition_notes?: string;
  start_page: number;
  end_page: number;
  volume: number;
}

interface FRSearchResponse {
  count: number;
  total_pages: number;
  results: FRDocument[];
  next_page_url?: string;
}

/**
 * Federal Register API Provider.
 *
 * Covers:
 * - REGULATIONS (rules, proposed rules)
 * - EXECUTIVE_ORDERS (executive orders, memoranda, proclamations)
 * - PUBLIC_RECORDS (notices, public inspection documents)
 */
export class FederalRegisterProvider extends BaseGovernmentProvider {
  readonly id: ProviderId = {
    slug: 'federal-register',
    name: 'Federal Register API',
    version: '1.0.0',
  };

  readonly capabilities: ProviderCapabilities = {
    domains: [
      GovernmentDomain.REGULATIONS,
      GovernmentDomain.EXECUTIVE_ORDERS,
      GovernmentDomain.PUBLIC_RECORDS,
    ],
    jurisdictions: [JurisdictionLevel.FEDERAL],
    jurisdictionCodes: ['US'],
    supportsSearch: true,
    supportsIncrementalSync: true,
    supportsWebhooks: false,
    supportsFullText: true,
    contentFormats: [ContentFormat.HTML, ContentFormat.XML, ContentFormat.PDF],
    maxResultsPerQuery: 1000,
    estimatedRecordCount: 2_000_000,
    features: {
      agencyFiltering: true,
      cfrReferences: true,
      docketTracking: true,
      publicCommentPeriods: true,
      executiveOrders: true,
      presidentialDocuments: true,
    },
  };

  protected async onInitialize(): Promise<void> {
    if (!this.config.baseUrl) {
      this.config.baseUrl = 'https://www.federalregister.gov/api/v1';
    }
  }

  async fetchRecord(externalId: string): Promise<GovernmentRecord> {
    const doc = await this.request<FRDocument>(
      `/documents/${externalId}.json?fields[]=title&fields[]=type&fields[]=subtype&fields[]=abstract&fields[]=action&fields[]=agencies&fields[]=docket_ids&fields[]=topics&fields[]=publication_date&fields[]=signing_date&fields[]=effective_on&fields[]=comments_close_on&fields[]=html_url&fields[]=pdf_url&fields[]=body_html_url&fields[]=full_text_xml_url&fields[]=raw_text_url&fields[]=executive_order_number&fields[]=regulation_id_numbers&fields[]=cfr_references&fields[]=start_page&fields[]=end_page&fields[]=volume&fields[]=significant&fields[]=disposition_notes`,
    );
    return this.normalizeDocument(doc);
  }

  async fetchRecordText(externalId: string): Promise<string> {
    const doc = await this.request<FRDocument>(
      `/documents/${externalId}.json?fields[]=raw_text_url&fields[]=body_html_url`,
    );

    if (doc.raw_text_url) {
      return this.fetchTextContent(doc.raw_text_url);
    }
    if (doc.body_html_url) {
      return this.fetchTextContent(doc.body_html_url);
    }

    throw new ProviderError(
      `No text available for document ${externalId}`,
      this.id.slug,
      false,
    );
  }

  async search(params: SearchParams): Promise<SearchResult> {
    const queryParts: string[] = [];

    if (params.query) {
      queryParts.push(`conditions[term]=${encodeURIComponent(params.query)}`);
    }

    // Map domain to Federal Register document type
    if (params.domain === GovernmentDomain.REGULATIONS) {
      queryParts.push('conditions[type][]=RULE', 'conditions[type][]=PRORULE');
    } else if (params.domain === GovernmentDomain.EXECUTIVE_ORDERS) {
      queryParts.push('conditions[type][]=PRESDOCU');
      queryParts.push('conditions[presidential_document_type][]=executive_order');
    }

    if (params.dateFrom) {
      queryParts.push(
        `conditions[publication_date][gte]=${params.dateFrom}`,
      );
    }
    if (params.dateTo) {
      queryParts.push(
        `conditions[publication_date][lte]=${params.dateTo}`,
      );
    }
    if (params.subjects?.length) {
      params.subjects.forEach((s) =>
        queryParts.push(`conditions[topics][]=${encodeURIComponent(s)}`),
      );
    }

    const limit = params.limit ?? 20;
    const page = params.offset ? Math.floor(params.offset / limit) + 1 : 1;
    queryParts.push(`per_page=${limit}`, `page=${page}`);

    // Always request the fields we need
    queryParts.push(
      'fields[]=document_number',
      'fields[]=title',
      'fields[]=type',
      'fields[]=subtype',
      'fields[]=abstract',
      'fields[]=agencies',
      'fields[]=topics',
      'fields[]=publication_date',
      'fields[]=effective_on',
      'fields[]=html_url',
      'fields[]=pdf_url',
      'fields[]=executive_order_number',
    );

    const response = await this.request<FRSearchResponse>(
      `/documents.json?${queryParts.join('&')}`,
    );

    return {
      records: response.results.map((doc) => this.normalizeDocument(doc)),
      total: response.count,
      hasMore: !!response.next_page_url,
      nextOffset: response.next_page_url ? (page * limit) : undefined,
    };
  }

  async fetchUpdatedSince(since: Date): Promise<GovernmentRecord[]> {
    const dateStr = since.toISOString().split('T')[0];
    const records: GovernmentRecord[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.request<FRSearchResponse>(
        `/documents.json?conditions[publication_date][gte]=${dateStr}&per_page=100&page=${page}&order=oldest&fields[]=document_number&fields[]=title&fields[]=type&fields[]=subtype&fields[]=abstract&fields[]=agencies&fields[]=topics&fields[]=publication_date&fields[]=effective_on&fields[]=html_url&fields[]=pdf_url&fields[]=executive_order_number`,
      );

      records.push(
        ...response.results.map((doc) => this.normalizeDocument(doc)),
      );

      hasMore = !!response.next_page_url;
      page++;

      // Safety limit
      if (records.length >= 5000) break;
    }

    return records;
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      await this.request<FRSearchResponse>(
        '/documents.json?per_page=1&fields[]=document_number',
      );
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        message: 'Federal Register API is responsive',
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

  private normalizeDocument(doc: FRDocument): GovernmentRecord {
    const domain = this.mapDocTypeToDomain(doc.type, doc.subtype);
    const status = this.mapToStatus(doc);

    const author: RecordActor | undefined =
      doc.agencies?.length > 0
        ? {
            name: doc.agencies[0].name,
            role: 'issuing-agency',
            organization: doc.agencies[0].name,
          }
        : undefined;

    const coAuthors: RecordActor[] =
      doc.agencies?.slice(1).map((a) => ({
        name: a.name,
        role: 'co-issuing-agency',
        organization: a.name,
      })) ?? [];

    const actions: RecordAction[] = [];

    if (doc.publication_date) {
      actions.push({
        date: doc.publication_date,
        description: 'Published in the Federal Register',
        actionType: 'published',
        actor: author,
      });
    }

    if (doc.effective_on) {
      actions.push({
        date: doc.effective_on,
        description: `Effective date: ${doc.effective_on}`,
        actionType: 'effective',
      });
    }

    if (doc.comments_close_on) {
      actions.push({
        date: doc.comments_close_on,
        description: `Public comment period closes: ${doc.comments_close_on}`,
        actionType: 'comment-period-close',
      });
    }

    const identifier = doc.executive_order_number
      ? `EO ${doc.executive_order_number}`
      : doc.document_number;

    return {
      externalId: doc.document_number,
      providerSlug: this.id.slug,
      domain,
      jurisdiction: {
        level: JurisdictionLevel.FEDERAL,
        code: 'US',
        name: 'United States',
      },
      title: doc.title,
      identifier,
      status,
      dateIntroduced: doc.signing_date ?? doc.publication_date,
      dateUpdated: doc.publication_date,
      dateEffective: doc.effective_on,
      summary: doc.abstract,
      sourceUrls: [doc.html_url, doc.pdf_url].filter(Boolean),
      author,
      coAuthors,
      actions,
      subjects: doc.topics ?? [],
      relatedRecords: doc.regulation_id_numbers?.map((rin) => ({
        externalId: rin,
        relationship: 'regulation-id',
        title: `RIN ${rin}`,
      })) ?? [],
      extensions: {
        documentType: doc.type,
        subtype: doc.subtype,
        docketIds: doc.docket_ids,
        cfrReferences: doc.cfr_references,
        significant: doc.significant,
        executiveOrderNumber: doc.executive_order_number,
        volume: doc.volume,
        startPage: doc.start_page,
        endPage: doc.end_page,
      },
    };
  }

  private mapDocTypeToDomain(
    type: string,
    subtype?: string,
  ): GovernmentDomain {
    if (type === 'Presidential Document') {
      return GovernmentDomain.EXECUTIVE_ORDERS;
    }
    if (type === 'Rule' || type === 'Proposed Rule') {
      return GovernmentDomain.REGULATIONS;
    }
    return GovernmentDomain.PUBLIC_RECORDS;
  }

  private mapToStatus(doc: FRDocument): RecordStatus {
    if (doc.type === 'Proposed Rule') {
      if (doc.comments_close_on) {
        const closeDate = new Date(doc.comments_close_on);
        if (closeDate > new Date()) {
          return RecordStatus.PUBLIC_COMMENT;
        }
      }
      return RecordStatus.PROPOSED;
    }

    if (doc.effective_on) {
      const effectiveDate = new Date(doc.effective_on);
      if (effectiveDate > new Date()) {
        return RecordStatus.APPROVED;
      }
      return RecordStatus.ACTIVE;
    }

    if (doc.type === 'Rule') {
      return RecordStatus.ENACTED;
    }

    return RecordStatus.ACTIVE;
  }
}
