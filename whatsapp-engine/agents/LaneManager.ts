/**
 * LaneManager ensures sequential in-order execution for messages from the same customer.
 * Uses per-customer promise chain queues keyed by `${tenantId}:${senderPhone}`.
 */
export class LaneManager {
  private static lanes: Map<string, Promise<any>> = new Map();

  /**
   * Enqueues an asynchronous task in the specific customer's lane.
   * Guarantees that subsequent calls for the same customer wait for prior tasks to resolve.
   */
  static async runInLane<T>(
    tenantId: string,
    senderPhone: string,
    task: () => Promise<T>
  ): Promise<T> {
    const laneKey = `${tenantId}:${senderPhone}`;
    const previousTask = this.lanes.get(laneKey) || Promise.resolve();

    let taskResolve: (val: T) => void;
    let taskReject: (err: any) => void;

    const currentTaskPromise = new Promise<T>((resolve, reject) => {
      taskResolve = resolve;
      taskReject = reject;
    });

    // Chain the task to the tail of the lane
    const chained = previousTask
      .catch(() => {
        // Swallow prior failure so the lane doesn't permanently stall
      })
      .then(async () => {
        try {
          const result = await task();
          taskResolve(result);
          return result;
        } catch (err) {
          taskReject(err);
          throw err;
        }
      })
      .finally(() => {
        // Clean up map entry if this is still the active tail
        if (this.lanes.get(laneKey) === chained) {
          this.lanes.delete(laneKey);
        }
      });

    this.lanes.set(laneKey, chained);

    return currentTaskPromise;
  }

  /**
   * Returns current active lane count for monitoring
   */
  static getActiveLaneCount(): number {
    return this.lanes.size;
  }
}
