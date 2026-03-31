// ============================================================================
// USASpending.gov Provider
// ============================================================================
// Connects to the USASpending.gov API — the official source for federal
// spending data including contracts, grants, loans, direct payments, and
// agency budgets.
//
// API Docs: https://api.usaspending.gov/

import { BaseGovernmentProvider, ProviderError } from './base-provider';
import {
  GovernmentDomain,
  GovernmentRecord,
  JurisdictionLevel,
  ProviderId,
  ProviderCapabilities,
  ProviderHealth,
  RecordActor,
  RecordStatus,
  SearchParams,
  SearchResult,
  ContentFormat,
  FinancialData,
  FinancialLineItem,
} from '../types';

// -- USASpending API response types --

interface USASpendingAward {
  Award: {
    id: number;
    generated_unique_award_id: string;
    type: string;
    type_description: string;
    category: string;
    description: string;
    total_obligation: number;
    base_and_all_options_value: number;
    date_signed: string;
    period_of_performance_start_date: string;
    period_of_performance_current_end_date: string;
    awarding_agency: {
      toptier_agency: { name: string; code: string };
      subtier_agency: { name: string; code: string };
    };
    funding_agency: {
      toptier_agency: { name: string; code: string };
      subtier_agency: { name: string; code: string };
    };
    recipient: {
      recipient_name: string;
      recipient_unique_id: string; // DUNS/UEI
      business_categories: string[];
      location: {
        address_line1: string;
        city_name: string;
        state_code: string;
        zip5: string;
        country_name: string;
      };
    };
    place_of_performance: {
      city_name: string;
      state_code: string;
      zip5: string;
      country_name: string;
    };
    naics: string;
    psc: string;
    cfda_number?: string;
    subaward_count: number;
    transaction_count: number;
  };
}

interface USASpendingSearchResponse {
  page_metadata: {
    page: number;
    count: number;
    hasNext: boolean;
  };
  results: Array<{
    Award: {
      id: number;
      generated_unique_award_id: string;
      type: string;
      type_description: string;
      description: string;
      total_obligation: number;
      date_signed: string;
      period_of_performance_start_date: string;
      period_of_performance_current_end_date: string;
      awarding_agency: {
        toptier_agency: { name: string };
        subtier_agency: { name: string };
      };
      recipient: {
        recipient_name: string;
      };
    };
  }>;
}

interface USASpendingAgencyBudget {
  fiscal_year: number;
  agency_name: string;
  toptier_code: string;
  total_budgetary_resources: number;
  agency_budgetary_resources: number;
  obligated_amount: number;
  unobligated_balance: number;
}

interface USASpendingFederalAccount {
  account_title: string;
  account_number: string;
  managing_agency: string;
  managing_agency_acronym: string;
  budget_authority_amount: number;
  obligated_amount: number;
  outlay_amount: number;
}

/**
 * USASpending.gov API Provider.
 *
 * Covers:
 * - BUDGET (agency budgets, federal accounts, appropriations)
 * - PROCUREMENT (contracts, grants, loans, direct payments)
 */
export class USASpendingProvider extends BaseGovernmentProvider {
  readonly id: ProviderId = {
    slug: 'usa-spending',
    name: 'USASpending.gov API',
    version: '1.0.0',
  };

  readonly capabilities: ProviderCapabilities = {
    domains: [GovernmentDomain.BUDGET, GovernmentDomain.PROCUREMENT],
    jurisdictions: [JurisdictionLevel.FEDERAL],
    jurisdictionCodes: ['US'],
    supportsSearch: true,
    supportsIncrementalSync: true,
    supportsWebhooks: false,
    supportsFullText: false,
    contentFormats: [ContentFormat.JSON],
    maxResultsPerQuery: 100,
    estimatedRecordCount: 50_000_000,
    features: {
      contractTracking: true,
      grantTracking: true,
      agencyBudgets: true,
      federalAccounts: true,
      subawardTracking: true,
      recipientProfiles: true,
      geographicBreakdown: true,
      spendingByCategory: true,
    },
  };

  protected async onInitialize(): Promise<void> {
    if (!this.config.baseUrl) {
      this.config.baseUrl = 'https://api.usaspending.gov/api/v2';
    }
  }

  async fetchRecord(externalId: string): Promise<GovernmentRecord> {
    const response = await this.request<USASpendingAward>(
      `/awards/${externalId}/`,
    );
    return this.normalizeAward(response);
  }

  async fetchRecordText(externalId: string): Promise<string> {
    const record = await this.fetchRecord(externalId);
    return record.summary ?? `Award ${externalId}: ${record.title}`;
  }

  async search(params: SearchParams): Promise<SearchResult> {
    const limit = params.limit ?? 25;
    const page = params.offset ? Math.floor(params.offset / limit) + 1 : 1;

    // USASpending uses POST for searches
    const body: Record<string, unknown> = {
      page,
      limit,
      sort: params.sortBy === 'date' ? 'Award Date' : 'Award Amount',
      order: params.sortOrder ?? 'desc',
      subawards: false,
    };

    const filters: Record<string, unknown> = {};

    if (params.query) {
      filters.keywords = [params.query];
    }
    if (params.dateFrom || params.dateTo) {
      filters.time_period = [
        {
          start_date: params.dateFrom ?? '2000-01-01',
          end_date: params.dateTo ?? new Date().toISOString().split('T')[0],
        },
      ];
    }

    // Map domain to award type
    if (params.domain === GovernmentDomain.PROCUREMENT) {
      filters.award_type_codes = ['A', 'B', 'C', 'D']; // Contracts
    } else if (params.domain === GovernmentDomain.BUDGET) {
      filters.award_type_codes = ['02', '03', '04', '05']; // Grants
    }

    body.filters = filters;

    const response = await this.postRequest<USASpendingSearchResponse>(
      '/search/spending_by_award/',
      body,
    );

    return {
      records: response.results.map((r) =>
        this.normalizeSearchResult(r),
      ),
      total: response.page_metadata.count,
      hasMore: response.page_metadata.hasNext,
      nextOffset: response.page_metadata.hasNext ? page * limit : undefined,
    };
  }

  async fetchUpdatedSince(since: Date): Promise<GovernmentRecord[]> {
    const dateStr = since.toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    const body = {
      page: 1,
      limit: 100,
      sort: 'Award Date',
      order: 'desc' as const,
      subawards: false,
      filters: {
        time_period: [{ start_date: dateStr, end_date: today }],
      },
    };

    const response = await this.postRequest<USASpendingSearchResponse>(
      '/search/spending_by_award/',
      body,
    );

    return response.results.map((r) => this.normalizeSearchResult(r));
  }

  /**
   * Fetch agency budget data for a fiscal year.
   */
  async fetchAgencyBudgets(
    fiscalYear: number,
  ): Promise<GovernmentRecord[]> {
    const response = await this.request<{
      results: USASpendingAgencyBudget[];
    }>(`/agency/budget/?fiscal_year=${fiscalYear}`);

    return response.results.map((budget) =>
      this.normalizeAgencyBudget(budget),
    );
  }

  /**
   * Fetch federal account spending for a specific agency.
   */
  async fetchFederalAccounts(
    agencyCode: string,
    fiscalYear: number,
  ): Promise<GovernmentRecord[]> {
    const body = {
      fiscal_year: fiscalYear,
      funding_agency_id: agencyCode,
      page: 1,
      limit: 100,
      sort: { field: 'obligated_amount', direction: 'desc' },
    };

    const response = await this.postRequest<{
      results: USASpendingFederalAccount[];
    }>('/federal_accounts/', body);

    return response.results.map((account) =>
      this.normalizeFederalAccount(account, fiscalYear),
    );
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      await this.request<{ api_version: string }>('/agency/budget/?fiscal_year=2024&limit=1');
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        message: 'USASpending.gov API is responsive',
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        message: `Health check failed: ${(error as Error).message}`,
      };
    }
  }

  // -- POST request helper (USASpending uses POST for searches) --

  private async postRequest<T>(
    url: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    return this.request<T>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // -- Normalization --

  private normalizeAward(response: USASpendingAward): GovernmentRecord {
    const award = response.Award;
    const domain =
      ['A', 'B', 'C', 'D'].includes(award.type)
        ? GovernmentDomain.PROCUREMENT
        : GovernmentDomain.BUDGET;

    const financials: FinancialData = {
      amount: award.total_obligation,
      currency: 'USD',
      category: award.type_description,
      fundingAgency: award.funding_agency?.toptier_agency?.name,
      recipient: award.recipient?.recipient_name,
    };

    const author: RecordActor = {
      name: award.awarding_agency?.toptier_agency?.name ?? 'Unknown Agency',
      role: 'awarding-agency',
      organization: award.awarding_agency?.subtier_agency?.name,
    };

    return {
      externalId: award.generated_unique_award_id,
      providerSlug: this.id.slug,
      domain,
      jurisdiction: {
        level: JurisdictionLevel.FEDERAL,
        code: 'US',
        name: 'United States',
      },
      title: award.description || `${award.type_description} Award`,
      identifier: award.generated_unique_award_id,
      status: this.mapAwardStatus(award),
      dateIntroduced: award.date_signed,
      dateUpdated: award.date_signed,
      dateEffective: award.period_of_performance_start_date,
      dateExpires: award.period_of_performance_current_end_date,
      summary: `${award.type_description}: $${award.total_obligation.toLocaleString()} to ${award.recipient?.recipient_name ?? 'Unknown'} from ${award.awarding_agency?.toptier_agency?.name ?? 'Unknown'}`,
      sourceUrls: [
        `https://www.usaspending.gov/award/${award.generated_unique_award_id}`,
      ],
      author,
      financials,
      subjects: [award.type_description, award.category],
      extensions: {
        recipientId: award.recipient?.recipient_unique_id,
        recipientLocation: award.recipient?.location,
        placeOfPerformance: award.place_of_performance,
        naicsCode: award.naics,
        pscCode: award.psc,
        cfdaNumber: award.cfda_number,
        subawardCount: award.subaward_count,
        transactionCount: award.transaction_count,
        baseAndAllOptionsValue: award.base_and_all_options_value,
      },
    };
  }

  private normalizeSearchResult(result: {
    Award: {
      id: number;
      generated_unique_award_id: string;
      type: string;
      type_description: string;
      description: string;
      total_obligation: number;
      date_signed: string;
      period_of_performance_start_date: string;
      period_of_performance_current_end_date: string;
      awarding_agency: {
        toptier_agency: { name: string };
        subtier_agency: { name: string };
      };
      recipient: { recipient_name: string };
    };
  }): GovernmentRecord {
    const award = result.Award;

    return {
      externalId: award.generated_unique_award_id,
      providerSlug: this.id.slug,
      domain: ['A', 'B', 'C', 'D'].includes(award.type)
        ? GovernmentDomain.PROCUREMENT
        : GovernmentDomain.BUDGET,
      jurisdiction: {
        level: JurisdictionLevel.FEDERAL,
        code: 'US',
        name: 'United States',
      },
      title: award.description || `${award.type_description} Award`,
      identifier: award.generated_unique_award_id,
      status: RecordStatus.ACTIVE,
      dateIntroduced: award.date_signed,
      dateUpdated: award.date_signed,
      dateEffective: award.period_of_performance_start_date,
      dateExpires: award.period_of_performance_current_end_date,
      summary: `$${award.total_obligation?.toLocaleString()} — ${award.recipient?.recipient_name ?? 'Unknown'}`,
      sourceUrls: [
        `https://www.usaspending.gov/award/${award.generated_unique_award_id}`,
      ],
      author: {
        name: award.awarding_agency?.toptier_agency?.name ?? 'Unknown',
        role: 'awarding-agency',
      },
      financials: {
        amount: award.total_obligation,
        currency: 'USD',
        category: award.type_description,
      },
    };
  }

  private normalizeAgencyBudget(
    budget: USASpendingAgencyBudget,
  ): GovernmentRecord {
    return {
      externalId: `budget-${budget.toptier_code}-${budget.fiscal_year}`,
      providerSlug: this.id.slug,
      domain: GovernmentDomain.BUDGET,
      jurisdiction: {
        level: JurisdictionLevel.FEDERAL,
        code: 'US',
        name: 'United States',
      },
      title: `${budget.agency_name} — FY${budget.fiscal_year} Budget`,
      identifier: `${budget.toptier_code}-FY${budget.fiscal_year}`,
      status: RecordStatus.ACTIVE,
      dateIntroduced: `${budget.fiscal_year - 1}-10-01`,
      dateUpdated: new Date().toISOString().split('T')[0],
      summary: `Total resources: $${budget.total_budgetary_resources.toLocaleString()}, Obligated: $${budget.obligated_amount.toLocaleString()}`,
      sourceUrls: [
        `https://www.usaspending.gov/agency/${budget.toptier_code}`,
      ],
      author: {
        name: budget.agency_name,
        role: 'agency',
        organization: budget.agency_name,
      },
      financials: {
        amount: budget.total_budgetary_resources,
        currency: 'USD',
        fiscalYear: budget.fiscal_year,
        category: 'Agency Budget',
        fundingAgency: budget.agency_name,
        lineItems: [
          {
            description: 'Total Budgetary Resources',
            amount: budget.total_budgetary_resources,
            category: 'resources',
          },
          {
            description: 'Obligated Amount',
            amount: budget.obligated_amount,
            category: 'obligations',
          },
          {
            description: 'Unobligated Balance',
            amount: budget.unobligated_balance,
            category: 'unobligated',
          },
        ],
      },
    };
  }

  private normalizeFederalAccount(
    account: USASpendingFederalAccount,
    fiscalYear: number,
  ): GovernmentRecord {
    return {
      externalId: `account-${account.account_number}-${fiscalYear}`,
      providerSlug: this.id.slug,
      domain: GovernmentDomain.BUDGET,
      jurisdiction: {
        level: JurisdictionLevel.FEDERAL,
        code: 'US',
        name: 'United States',
      },
      title: `${account.account_title} — FY${fiscalYear}`,
      identifier: account.account_number,
      status: RecordStatus.ACTIVE,
      dateIntroduced: `${fiscalYear - 1}-10-01`,
      dateUpdated: new Date().toISOString().split('T')[0],
      sourceUrls: [],
      author: {
        name: account.managing_agency,
        role: 'managing-agency',
        organization: `${account.managing_agency} (${account.managing_agency_acronym})`,
      },
      financials: {
        amount: account.budget_authority_amount,
        currency: 'USD',
        fiscalYear,
        category: 'Federal Account',
        lineItems: [
          {
            description: 'Budget Authority',
            amount: account.budget_authority_amount,
            category: 'authority',
          },
          {
            description: 'Obligated Amount',
            amount: account.obligated_amount,
            category: 'obligations',
          },
          {
            description: 'Outlay Amount',
            amount: account.outlay_amount,
            category: 'outlays',
          },
        ],
      },
    };
  }

  private mapAwardStatus(award: {
    period_of_performance_current_end_date: string;
    date_signed: string;
  }): RecordStatus {
    if (award.period_of_performance_current_end_date) {
      const endDate = new Date(award.period_of_performance_current_end_date);
      if (endDate < new Date()) return RecordStatus.EXPIRED;
    }
    return RecordStatus.ACTIVE;
  }
}
