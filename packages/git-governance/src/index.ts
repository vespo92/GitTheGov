// ============================================================================
// @constitutional-shrinkage/git-governance
// ============================================================================
// Git primitives and version control for ALL government domains.
//
// This package provides:
// 1. GovernanceEngine — the central orchestrator for Git-style government
// 2. Domain modules — budget, regulatory, executive, judicial, public records
// 3. Repository types — governance repos, branches, merge requests
// 4. Blame & history — full audit trail for every government record
//
// Usage:
//   import { GovernanceEngine } from '@constitutional-shrinkage/git-governance';
//   import { FederalRegisterProvider, USASpendingProvider } from '@constitutional-shrinkage/government-api-framework';
//
//   const engine = new GovernanceEngine();
//   await engine.addProvider(new FederalRegisterProvider(), { ... });
//   await engine.addProvider(new USASpendingProvider(), { ... });
//
//   const repo = engine.createRepository(GovernmentDomain.BUDGET, {
//     jurisdictionCode: 'US',
//     jurisdictionName: 'United States',
//     jurisdictionLevel: JurisdictionLevel.FEDERAL,
//     fiscalYear: 2025,
//   });
//
//   const report = await engine.syncAll();

// Types
export * from './types';

// Domain Modules
export * from './domains';

// Primitives (Engine)
export * from './primitives';
