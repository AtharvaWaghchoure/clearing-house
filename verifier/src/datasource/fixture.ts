import type { ComplianceDataSource, ComplianceEvent, OnChainSettlement } from '../types.js';

/** In-memory data source — used by unit tests and the offline demo. Identical reconstruction path
 *  as the live chain / subgraph sources. */
export class FixtureDataSource implements ComplianceDataSource {
  readonly label: string;
  constructor(
    private readonly settlements: OnChainSettlement[],
    private readonly events: ComplianceEvent[],
    label = 'fixture',
  ) {
    this.label = label;
  }
  async getSettlements(): Promise<OnChainSettlement[]> {
    return this.settlements;
  }
  async getComplianceEvents(): Promise<ComplianceEvent[]> {
    return this.events;
  }
}
