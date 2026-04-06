// ============================================================================
// @constitutional-shrinkage/government-api-framework
// ============================================================================
// Pluggable framework for integrating any government data API into the
// GitTheGov platform. Provides:
//
// 1. GovernmentApiProvider interface — the plug-and-play contract
// 2. BaseGovernmentProvider — shared infrastructure (rate limiting, retries)
// 3. ProviderRegistry — central hub for discovery, routing, health monitoring
// 4. Concrete providers — Federal Register, USASpending, Regulations.gov,
//    CourtListener, OpenStates
// 5. Record-to-Commit adapter — converts any government record to Git commits
//
// Usage:
//   import { ProviderRegistry, FederalRegisterProvider } from '@constitutional-shrinkage/government-api-framework';
//
//   const registry = new ProviderRegistry();
//   await registry.register(new FederalRegisterProvider(), { ... });
//   const results = await registry.searchAll({ query: 'climate', domain: GovernmentDomain.REGULATIONS });

// Types
export * from './types';

// Providers
export * from './providers';

// Registry
export * from './registry';

// Adapters (Record → Git Commits)
export * from './adapters';
