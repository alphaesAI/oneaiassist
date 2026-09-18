import { IInsuranceAgent, AgentContext, AgentResponse } from './types';

export class AgentRegistry {
  private static agents: Map<string, IInsuranceAgent> = new Map();

  /**
   * Registers an agent implementation
   */
  static register(agent: IInsuranceAgent): void {
    this.agents.set(agent.name, agent);
    console.log(`[AgentRegistry] Registered agent: ${agent.name}`);
  }

  /**
   * Gets a registered agent by name
   */
  static get(name: string): IInsuranceAgent | undefined {
    return this.agents.get(name);
  }

  /**
   * Returns all registered agents
   */
  static getAll(): IInsuranceAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Finds the best agent capable of handling the current context
   */
  static async resolveAgent(context: AgentContext): Promise<IInsuranceAgent | null> {
    for (const agent of Array.from(this.agents.values())) {
      if (await agent.canHandle(context)) {
        return agent;
      }
    }
    return null;
  }
}
