// ============================================================================
// Regulations.gov Provider
// ============================================================================
// Connects to the Regulations.gov API — the public portal for federal
// rulemaking. Tracks proposed rules, public comments, and final rules
// across all federal agencies.
//
// API Docs: https://open.gsa.gov/api/regulationsgov/

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

// -- Regulations.gov API response types --

interface RegGovDocket {
  id: string;
  type: 'dockets';
  attributes: {
    agencyId: string;
    category: 'Rulemaking' | 'Nonrulemaking' | 'Other';
    docketType: string;
    effectiveDate?: string;
    field1?: string;
    field2?: string;
    highlightedContent?: string;
    keywords: string[];
    lastModifiedDate: string;
    objectId: string;
    organization?: string;
    petitionNbr?: string;
    program?: string;
    rin?: string;
    shortTitle?: string;
    subType?: string;
    subType2?: string;
    title: string;
  };
}

interface RegGovDocument {
  id: string;
  type: 'documents';
  attributes: {
    agencyId: string;
    commentEndDate?: string;
    commentStartDate?: string;
    docketId: string;
    documentType: 'Proposed Rule' | 'Rule' | 'Notice' | 'Supporting & Related Material' | 'Other';
    frDocNum?: string;
    highlightedContent?: string;
    lastModifiedDate: string;
    objectId: string;
    postedDate: string;
    receiveDate?: string;
    subtype?: string;
    title: string;
    withdrawn: boolean;
    openForComment: boolean;
  };
  links?: {
    self: string;
  };
}

interface RegGovComment {
  id: string;
  type: 'comments';
  attributes: {
    agencyId: string;
    category?: string;
    comment?: string;
    docketId: string;
    documentType: string;
    duplicateComments: number;
    objectId: string;
    postedDate: string;
    receiveDate: string;
    title: string;
    withdrawn: boolean;
  };
}

interface RegGovSearchResponse {
  data: Array<RegGovDocket | RegGovDocument | RegGovComment>;
  meta: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    numberOfElements: number;
    pageNumber: number;
    pageSize: number;
    totalElements: number;
    totalPages: number;
  };
}

/**
 * Regulations.gov API Provider.
 *
 * Covers:
 * - REGULATIONS (rulemaking dockets, proposed rules, final rules)
 * - PUBLIC_RECORDS (public comments on regulations)
 */
export class RegulationsGovProvider extends BaseGovernmentProvider {
  readonly id: ProviderId = {
    slug: 'regulations-gov',
    name: 'Regulations.gov API',
    version: '1.0.0',
  };

  readonly capabilities: ProviderCapabilities = {
    domains: [GovernmentDomain.REGULATIONS, GovernmentDomain.PUBLIC_RECORDS],
    jurisdictions: [JurisdictionLevel.FEDERAL],
    jurisdictionCodes: ['US'],
    supportsSearch: true,
    supportsIncrementalSync: true,
    supportsWebhooks: false,
    supportsFullText: true,
    contentFormats: [ContentFormat.JSON, ContentFormat.HTML],
    maxResultsPerQuery: 250,
    estimatedRecordCount: 15_000_000,
    features: {
      docketTracking: true,
      publicComments: true,
      commentPeriodTracking: true,
      agencyFiltering: true,
      documentAttachments: true,
      commentAnalysis: true,
    },
  };

  protected async onInitialize(): Promise<void> {
    if (!this.config.baseUrl) {
      this.config.baseUrl = 'https://api.regulations.gov/v4';
    }
    if (!this.config.apiKey) {
      throw new ProviderError(
        'Regulations.gov requires an API key. Get one at https://open.gsa.gov/api/regulationsgov/',
        this.id.slug,
        false,
      );
    }
  }

  async fetchRecord(externalId: string): Promise<GovernmentRecord> {
    // Try document first, fall back to docket
    try {
      const doc = await this.request<{ data: RegGovDocument }>(
        `/documents/${externalId}?api_key=${this.config.apiKey}`,
      );
      return this.normalizeDocument(doc.data);
    } catch {
      const docket = await this.request<{ data: RegGovDocket }>(
        `/dockets/${externalId}?api_key=${this.config.apiKey}`,
      );
      return this.normalizeDocket(docket.data);
    }
  }

  async fetchRecordText(externalId: string): Promise<string> {
    // Fetch document detail which may include content
    const doc = await this.request<{ data: RegGovDocument }>(
      `/documents/${externalId}?api_key=${this.config.apiKey}&include=attachments`,
    );
    return doc.data.attributes.highlightedContent ?? doc.data.attributes.title;
  }

  async search(params: SearchParams): Promise<SearchResult> {
    const queryParts: string[] = [`api_key=${this.config.apiKey}`];

    if (params.query) {
      queryParts.push(`filter[searchTerm]=${encodeURIComponent(params.query)}`);
    }

    // Document type filter
    if (params.domain === GovernmentDomain.REGULATIONS) {
      queryParts.push(
        'filter[documentType]=Proposed Rule,Rule',
      );
    }

    if (params.dateFrom) {
      queryParts.push(
        `filter[postedDate][ge]=${params.dateFrom}`,
      );
    }
    if (params.dateTo) {
      queryParts.push(
        `filter[postedDate][le]=${params.dateTo}`,
      );
    }

    const pageSize = params.limit ?? 25;
    const page = params.offset ? Math.floor(params.offset / pageSize) + 1 : 1;
    queryParts.push(`page[size]=${pageSize}`, `page[number]=${page}`);

    if (params.sortBy === 'date') {
      queryParts.push(
        `sort=${params.sortOrder === 'asc' ? '' : '-'}postedDate`,
      );
    }

    const response = await this.request<RegGovSearchResponse>(
      `/documents?${queryParts.join('&')}`,
    );

    return {
      records: response.data.map((item) => {
        if (item.type === 'documents') {
          return this.normalizeDocument(item as RegGovDocument);
        }
        if (item.type === 'dockets') {
          return this.normalizeDocket(item as RegGovDocket);
        }
        return this.normalizeComment(item as RegGovComment);
      }),
      total: response.meta.totalElements,
      hasMore: response.meta.hasNextPage,
      nextOffset: response.meta.hasNextPage ? page * pageSize : undefined,
    };
  }

  async fetchUpdatedSince(since: Date): Promise<GovernmentRecord[]> {
    const dateStr = since.toISOString().split('T')[0];
    const response = await this.request<RegGovSearchResponse>(
      `/documents?api_key=${this.config.apiKey}&filter[lastModifiedDate][ge]=${dateStr}&page[size]=100&sort=-lastModifiedDate`,
    );

    return response.data.map((item) => {
      if (item.type === 'documents') {
        return this.normalizeDocument(item as RegGovDocument);
      }
      return this.normalizeDocket(item as RegGovDocket);
    });
  }

  /**
   * Fetch public comments for a specific docket.
   */
  async fetchComments(
    docketId: string,
    limit = 25,
    page = 1,
  ): Promise<{ comments: GovernmentRecord[]; total: number }> {
    const response = await this.request<RegGovSearchResponse>(
      `/comments?api_key=${this.config.apiKey}&filter[docketId]=${docketId}&page[size]=${limit}&page[number]=${page}&sort=-postedDate`,
    );

    return {
      comments: response.data.map((c) =>
        this.normalizeComment(c as RegGovComment),
      ),
      total: response.meta.totalElements,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      await this.request<RegGovSearchResponse>(
        `/documents?api_key=${this.config.apiKey}&page[size]=1`,
      );
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        message: 'Regulations.gov API is responsive',
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

  private normalizeDocument(doc: RegGovDocument): GovernmentRecord {
    const attrs = doc.attributes;
    const actions: RecordAction[] = [];

    if (attrs.postedDate) {
      actions.push({
        date: attrs.postedDate,
        description: 'Posted on Regulations.gov',
        actionType: 'posted',
      });
    }
    if (attrs.commentStartDate) {
      actions.push({
        date: attrs.commentStartDate,
        description: 'Public comment period opened',
        actionType: 'comment-period-open',
      });
    }
    if (attrs.commentEndDate) {
      actions.push({
        date: attrs.commentEndDate,
        description: 'Public comment period closes',
        actionType: 'comment-period-close',
      });
    }

    return {
      externalId: doc.id,
      providerSlug: this.id.slug,
      domain:
        attrs.documentType === 'Rule' || attrs.documentType === 'Proposed Rule'
          ? GovernmentDomain.REGULATIONS
          : GovernmentDomain.PUBLIC_RECORDS,
      jurisdiction: {
        level: JurisdictionLevel.FEDERAL,
        code: 'US',
        name: 'United States',
      },
      title: attrs.title,
      identifier: doc.id,
      status: this.mapDocumentStatus(attrs),
      dateIntroduced: attrs.postedDate,
      dateUpdated: attrs.lastModifiedDate,
      sourceUrls: [`https://www.regulations.gov/document/${doc.id}`],
      author: {
        name: attrs.agencyId,
        role: 'issuing-agency',
      },
      actions,
      relatedRecords: [
        {
          externalId: attrs.docketId,
          providerSlug: this.id.slug,
          domain: GovernmentDomain.REGULATIONS,
          relationship: 'belongs-to-docket',
          title: attrs.docketId,
        },
      ],
      extensions: {
        documentType: attrs.documentType,
        docketId: attrs.docketId,
        frDocNum: attrs.frDocNum,
        openForComment: attrs.openForComment,
        commentEndDate: attrs.commentEndDate,
        withdrawn: attrs.withdrawn,
      },
    };
  }

  private normalizeDocket(docket: RegGovDocket): GovernmentRecord {
    const attrs = docket.attributes;

    return {
      externalId: docket.id,
      providerSlug: this.id.slug,
      domain: GovernmentDomain.REGULATIONS,
      jurisdiction: {
        level: JurisdictionLevel.FEDERAL,
        code: 'US',
        name: 'United States',
      },
      title: attrs.title,
      identifier: docket.id,
      status: attrs.effectiveDate
        ? RecordStatus.ACTIVE
        : RecordStatus.UNDER_REVIEW,
      dateIntroduced: attrs.lastModifiedDate,
      dateUpdated: attrs.lastModifiedDate,
      dateEffective: attrs.effectiveDate,
      sourceUrls: [`https://www.regulations.gov/docket/${docket.id}`],
      author: {
        name: attrs.agencyId,
        role: 'issuing-agency',
        organization: attrs.organization,
      },
      subjects: attrs.keywords ?? [],
      extensions: {
        category: attrs.category,
        docketType: attrs.docketType,
        rin: attrs.rin,
        program: attrs.program,
      },
    };
  }

  private normalizeComment(comment: RegGovComment): GovernmentRecord {
    const attrs = comment.attributes;

    return {
      externalId: comment.id,
      providerSlug: this.id.slug,
      domain: GovernmentDomain.PUBLIC_RECORDS,
      jurisdiction: {
        level: JurisdictionLevel.FEDERAL,
        code: 'US',
        name: 'United States',
      },
      title: attrs.title,
      identifier: comment.id,
      status: attrs.withdrawn ? RecordStatus.WITHDRAWN : RecordStatus.ACTIVE,
      dateIntroduced: attrs.receiveDate,
      dateUpdated: attrs.postedDate,
      textContent: attrs.comment,
      textFormat: ContentFormat.PLAIN_TEXT,
      sourceUrls: [`https://www.regulations.gov/comment/${comment.id}`],
      relatedRecords: [
        {
          externalId: attrs.docketId,
          relationship: 'comment-on-docket',
          title: attrs.docketId,
        },
      ],
      extensions: {
        duplicateCount: attrs.duplicateComments,
        category: attrs.category,
      },
    };
  }

  private mapDocumentStatus(attrs: RegGovDocument['attributes']): RecordStatus {
    if (attrs.withdrawn) return RecordStatus.WITHDRAWN;
    if (attrs.openForComment) return RecordStatus.PUBLIC_COMMENT;
    if (attrs.documentType === 'Proposed Rule') return RecordStatus.PROPOSED;
    if (attrs.documentType === 'Rule') return RecordStatus.ENACTED;
    return RecordStatus.ACTIVE;
  }
}
