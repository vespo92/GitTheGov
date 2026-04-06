// ============================================================================
// Governance Engine
// ============================================================================
// The central engine that ties everything together: provider registry,
// git-style repositories, domain operations, and real-time sync.
// This is the "git" of government.

import {
  GovernmentDomain,
  GovernmentRecord,
  GovernmentApiProvider,
  ProviderConfig,
  ProviderRegistry,
  SearchParams,
  JurisdictionLevel,
  recordToCommits,
  generateBlame,
  GovernanceCommit,
  GovernanceBlame,
} from '@constitutional-shrinkage/government-api-framework';

import {
  GovernanceRepository,
  GovernanceMergeRequest,
  MergeRequestStatus,
  GovernanceBranch,
  BranchPurpose,
} from '../types';

import { createBudgetRepository, BudgetPhase } from '../domains/budget-governance';
import { createRegulatoryRepository, RulemakingStage, RegulatoryDocket } from '../domains/regulatory-governance';
import { createExecutiveRepository } from '../domains/executive-governance';
import { createJudicialRepository, CourtInfo } from '../domains/judicial-governance';
import { createPublicRecordsRepository, PublicRecordType } from '../domains/public-records-governance';

// ---------------------------------------------------------------------------
// Engine State
// ---------------------------------------------------------------------------

interface EngineState {
  repositories: Map<string, GovernanceRepository>;
  commits: Map<string, GovernanceCommit[]>; // repoId → commits
  mergeRequests: Map<string, GovernanceMergeRequest[]>; // repoId → MRs
  records: Map<string, GovernmentRecord>; // externalId → record
}

// ---------------------------------------------------------------------------
// The Governance Engine
// ---------------------------------------------------------------------------

/**
 * The Governance Engine — the central orchestrator for Git-style government.
 *
 * Responsibilities:
 * 1. Manage the provider registry (plug-and-play API connections)
 * 2. Create and manage governance repositories per domain/jurisdiction
 * 3. Ingest government records and convert them to commits
 * 4. Provide search, blame, and history across all domains
 * 5. Manage merge requests (the "pull request" of government)
 */
export class GovernanceEngine {
  readonly registry: ProviderRegistry;
  private state: EngineState;

  constructor() {
    this.registry = new ProviderRegistry();
    this.state = {
      repositories: new Map(),
      commits: new Map(),
      mergeRequests: new Map(),
      records: new Map(),
    };
  }

  // -------------------------------------------------------------------------
  // Provider Management
  // -------------------------------------------------------------------------

  /**
   * Register a government API provider.
   */
  async addProvider(
    provider: GovernmentApiProvider,
    config: ProviderConfig,
  ): Promise<void> {
    await this.registry.register(provider, config);
  }

  /**
   * Remove a provider.
   */
  async removeProvider(slug: string): Promise<void> {
    await this.registry.unregister(slug);
  }

  // -------------------------------------------------------------------------
  // Repository Management
  // -------------------------------------------------------------------------

  /**
   * Create a governance repository for a specific domain and jurisdiction.
   * Automatically sets up the appropriate branch structure.
   */
  createRepository(
    domain: GovernmentDomain,
    options: CreateRepositoryOptions,
  ): GovernanceRepository {
    let repo: GovernanceRepository;

    switch (domain) {
      case GovernmentDomain.BUDGET:
        repo = createBudgetRepository(
          options.jurisdictionCode,
          options.jurisdictionName,
          options.jurisdictionLevel,
          options.fiscalYear ?? new Date().getFullYear(),
        );
        break;

      case GovernmentDomain.REGULATIONS:
        repo = createRegulatoryRepository(
          options.regulatoryDocket ?? {
            docketId: `${options.jurisdictionCode}-REG`,
            agency: options.jurisdictionName,
            title: `${options.jurisdictionName} Regulations`,
            stage: RulemakingStage.EFFECTIVE,
            cfrReferences: [],
            economicallySignificant: false,
            timeline: [],
          },
        );
        break;

      case GovernmentDomain.EXECUTIVE_ORDERS:
        repo = createExecutiveRepository(
          options.administration ?? 'Current',
          options.jurisdictionCode,
          options.jurisdictionName,
          options.jurisdictionLevel,
        );
        break;

      case GovernmentDomain.COURT_DECISIONS:
        repo = createJudicialRepository(
          options.court ?? {
            id: options.jurisdictionCode.toLowerCase(),
            name: options.jurisdictionName,
            level: 'district',
          },
        );
        break;

      case GovernmentDomain.PUBLIC_RECORDS:
        repo = createPublicRecordsRepository(
          options.jurisdictionCode,
          options.jurisdictionName,
          options.jurisdictionLevel,
          options.publicRecordType ?? PublicRecordType.FOIA,
        );
        break;

      default:
        repo = this.createGenericRepository(domain, options);
    }

    this.state.repositories.set(repo.id, repo);
    this.state.commits.set(repo.id, []);
    this.state.mergeRequests.set(repo.id, []);

    return repo;
  }

  /**
   * Get a repository by ID.
   */
  getRepository(repoId: string): GovernanceRepository | undefined {
    return this.state.repositories.get(repoId);
  }

  /**
   * List all repositories, optionally filtered.
   */
  listRepositories(filter?: {
    domain?: GovernmentDomain;
    jurisdictionCode?: string;
  }): GovernanceRepository[] {
    let repos = Array.from(this.state.repositories.values());

    if (filter?.domain) {
      repos = repos.filter((r) => r.domain === filter.domain);
    }
    if (filter?.jurisdictionCode) {
      repos = repos.filter(
        (r) => r.jurisdiction.code === filter.jurisdictionCode,
      );
    }

    return repos;
  }

  // -------------------------------------------------------------------------
  // Record Ingestion
  // -------------------------------------------------------------------------

  /**
   * Ingest a government record into the appropriate repository.
   * Converts the record into git-style commits and stores them.
   */
  ingestRecord(
    record: GovernmentRecord,
    repoId?: string,
  ): { repoId: string; commits: GovernanceCommit[] } {
    // Find or create the target repository
    const targetRepoId = repoId ?? this.findOrCreateRepo(record);

    // Convert record to commits
    const commits = recordToCommits(record);

    // Store
    this.state.records.set(record.externalId, record);
    const existing = this.state.commits.get(targetRepoId) ?? [];
    existing.push(...commits);
    this.state.commits.set(targetRepoId, existing);

    // Update repo metadata
    const repo = this.state.repositories.get(targetRepoId);
    if (repo) {
      repo.metadata.recordCount++;
      repo.metadata.commitCount += commits.length;
      repo.metadata.updatedAt = new Date().toISOString();

      // Update branch head
      if (commits.length > 0) {
        const defaultBranch = repo.branches.find(
          (b) => b.name === repo.defaultBranch,
        );
        if (defaultBranch) {
          defaultBranch.headCommitHash = commits[commits.length - 1].hash;
        }
      }
    }

    return { repoId: targetRepoId, commits };
  }

  /**
   * Sync all providers and ingest new records.
   */
  async syncAll(since?: Date): Promise<SyncReport> {
    const syncResult = await this.registry.syncAll(since);
    const report: SyncReport = {
      startedAt: new Date().toISOString(),
      providers: [],
      totalRecords: 0,
      totalCommits: 0,
      errors: [],
    };

    for (const [slug, result] of syncResult.byProvider) {
      let providerCommits = 0;

      for (const record of result.records) {
        try {
          const { commits } = this.ingestRecord(record);
          providerCommits += commits.length;
        } catch (error) {
          report.errors.push({
            provider: slug,
            recordId: record.externalId,
            message: (error as Error).message,
          });
        }
      }

      report.providers.push({
        slug,
        recordsIngested: result.records.length,
        commitsCreated: providerCommits,
        errors: result.errors,
      });

      report.totalRecords += result.records.length;
      report.totalCommits += providerCommits;
    }

    report.completedAt = new Date().toISOString();
    return report;
  }

  // -------------------------------------------------------------------------
  // Query Operations
  // -------------------------------------------------------------------------

  /**
   * Search across all providers and domains.
   */
  async search(params: SearchParams) {
    return this.registry.searchAll(params);
  }

  /**
   * Get commit history for a repository.
   */
  getCommitHistory(
    repoId: string,
    options?: { limit?: number; since?: string; author?: string },
  ): GovernanceCommit[] {
    let commits = this.state.commits.get(repoId) ?? [];

    if (options?.since) {
      const sinceDate = new Date(options.since);
      commits = commits.filter(
        (c) => new Date(c.timestamp) >= sinceDate,
      );
    }

    if (options?.author) {
      commits = commits.filter(
        (c) =>
          c.author.name.toLowerCase().includes(options.author!.toLowerCase()),
      );
    }

    // Most recent first
    commits = [...commits].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    if (options?.limit) {
      commits = commits.slice(0, options.limit);
    }

    return commits;
  }

  /**
   * Get blame (authorship) for a repository.
   */
  getBlame(repoId: string): GovernanceBlame | null {
    const commits = this.state.commits.get(repoId);
    if (!commits?.length) return null;
    return generateBlame(commits);
  }

  /**
   * Get a specific record and its full commit history.
   */
  getRecordWithHistory(externalId: string): {
    record: GovernmentRecord;
    commits: GovernanceCommit[];
    blame: GovernanceBlame;
  } | null {
    const record = this.state.records.get(externalId);
    if (!record) return null;

    // Find all commits for this record across all repos
    const allCommits: GovernanceCommit[] = [];
    for (const [, repoCommits] of this.state.commits) {
      allCommits.push(
        ...repoCommits.filter((c) => c.recordId === externalId),
      );
    }

    return {
      record,
      commits: allCommits,
      blame: generateBlame(allCommits),
    };
  }

  // -------------------------------------------------------------------------
  // Merge Requests
  // -------------------------------------------------------------------------

  /**
   * Create a merge request (the "pull request" of government).
   */
  createMergeRequest(
    repoId: string,
    request: Omit<GovernanceMergeRequest, 'id' | 'createdAt' | 'updatedAt' | 'discussions'>,
  ): GovernanceMergeRequest {
    const mr: GovernanceMergeRequest = {
      ...request,
      id: `mr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      discussions: [],
    };

    const existing = this.state.mergeRequests.get(repoId) ?? [];
    existing.push(mr);
    this.state.mergeRequests.set(repoId, existing);

    return mr;
  }

  /**
   * List merge requests for a repository.
   */
  listMergeRequests(
    repoId: string,
    status?: MergeRequestStatus,
  ): GovernanceMergeRequest[] {
    const mrs = this.state.mergeRequests.get(repoId) ?? [];
    if (status) return mrs.filter((mr) => mr.status === status);
    return mrs;
  }

  // -------------------------------------------------------------------------
  // Diagnostics
  // -------------------------------------------------------------------------

  /**
   * Get a full status report of the governance engine.
   */
  async getStatus(): Promise<GovernanceStatus> {
    const providers = this.registry.listProviders();
    const health = await this.registry.checkAllHealth();

    return {
      providers: providers.map((p) => ({
        ...p,
        health: health.get(p.slug) ?? null,
      })),
      repositories: Array.from(this.state.repositories.values()).map((r) => ({
        id: r.id,
        name: r.name,
        domain: r.domain,
        jurisdiction: r.jurisdiction.name,
        records: r.metadata.recordCount,
        commits: r.metadata.commitCount,
        branches: r.branches.length,
      })),
      totalRecords: this.state.records.size,
      totalCommits: Array.from(this.state.commits.values()).reduce(
        (sum, commits) => sum + commits.length,
        0,
      ),
      totalRepositories: this.state.repositories.size,
    };
  }

  /**
   * Shut down the engine gracefully.
   */
  async shutdown(): Promise<void> {
    await this.registry.shutdown();
    this.state.repositories.clear();
    this.state.commits.clear();
    this.state.mergeRequests.clear();
    this.state.records.clear();
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private findOrCreateRepo(record: GovernmentRecord): string {
    // Try to find an existing repo for this domain + jurisdiction
    const existing = Array.from(this.state.repositories.values()).find(
      (r) =>
        r.domain === record.domain &&
        r.jurisdiction.code === record.jurisdiction.code,
    );

    if (existing) return existing.id;

    // Create a new one
    const repo = this.createRepository(record.domain, {
      jurisdictionCode: record.jurisdiction.code,
      jurisdictionName: record.jurisdiction.name,
      jurisdictionLevel: record.jurisdiction.level,
    });

    return repo.id;
  }

  private createGenericRepository(
    domain: GovernmentDomain,
    options: CreateRepositoryOptions,
  ): GovernanceRepository {
    const id = `${domain.toLowerCase()}-${options.jurisdictionCode.toLowerCase()}`;

    return {
      id,
      name: `${options.jurisdictionName} — ${domain}`,
      domain,
      jurisdiction: {
        level: options.jurisdictionLevel,
        code: options.jurisdictionCode,
        name: options.jurisdictionName,
      },
      branches: [
        {
          name: 'main',
          purpose: BranchPurpose.CURRENT_LAW,
          headCommitHash: '',
          protected: true,
          createdAt: new Date().toISOString(),
          description: `Current ${domain.toLowerCase()} records`,
        },
        {
          name: 'proposals',
          purpose: BranchPurpose.PROPOSAL,
          headCommitHash: '',
          protected: false,
          createdAt: new Date().toISOString(),
          description: 'Proposed changes',
        },
      ],
      defaultBranch: 'main',
      metadata: {
        recordCount: 0,
        commitCount: 0,
        contributorCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        providerSlugs: [],
        tags: [domain.toLowerCase(), options.jurisdictionCode.toLowerCase()],
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Supporting Types
// ---------------------------------------------------------------------------

export interface CreateRepositoryOptions {
  jurisdictionCode: string;
  jurisdictionName: string;
  jurisdictionLevel: JurisdictionLevel;
  fiscalYear?: number;
  administration?: string;
  court?: CourtInfo;
  regulatoryDocket?: RegulatoryDocket;
  publicRecordType?: PublicRecordType;
}

export interface SyncReport {
  startedAt: string;
  completedAt?: string;
  providers: Array<{
    slug: string;
    recordsIngested: number;
    commitsCreated: number;
    errors: string[];
  }>;
  totalRecords: number;
  totalCommits: number;
  errors: Array<{
    provider: string;
    recordId: string;
    message: string;
  }>;
}

export interface GovernanceStatus {
  providers: Array<{
    slug: string;
    name: string;
    version: string;
    domains: GovernmentDomain[];
    healthy: boolean;
    enabled: boolean;
    health: unknown;
  }>;
  repositories: Array<{
    id: string;
    name: string;
    domain: GovernmentDomain;
    jurisdiction: string;
    records: number;
    commits: number;
    branches: number;
  }>;
  totalRecords: number;
  totalCommits: number;
  totalRepositories: number;
}
