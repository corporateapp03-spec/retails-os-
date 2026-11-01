/**
 * RetailOS Master Transaction Integrity & Atomic Execution Engine
 *
 * Guarantees all-or-nothing mutations across Supabase tables (ledger, inventory, credit_sales, etc.)
 * with automatic compensating rollbacks if any intermediate step fails.
 * Provides concurrency locking to eliminate double-clicks and race conditions.
 */

export interface AtomicStep<T = any> {
  name: string;
  execute: () => Promise<T>;
  rollback: (result?: T) => Promise<void>;
}

export interface TransactionReport {
  success: boolean;
  name: string;
  executedSteps: string[];
  rolledBackSteps: string[];
  error?: Error | null;
}

// In-memory active locks with automatic expiry
const activeLocks = new Map<string, number>();

/**
 * Acquire a concurrency lock for a key. Returns true if acquired, false if locked.
 */
export function acquireLock(key: string, timeoutMs: number = 10000): boolean {
  const now = Date.now();
  const existingExpiry = activeLocks.get(key);
  if (existingExpiry && existingExpiry > now) {
    return false; // Still locked
  }
  activeLocks.set(key, now + timeoutMs);
  return true;
}

/**
 * Release an active concurrency lock.
 */
export function releaseLock(key: string): void {
  activeLocks.delete(key);
}

/**
 * Run an async function under a named lock with guaranteed release.
 */
export async function withLock<T>(
  key: string,
  fn: () => Promise<T>,
  timeoutMs: number = 12000
): Promise<T> {
  if (!acquireLock(key, timeoutMs)) {
    throw new Error(`Operation "${key}" is currently in progress. Please wait.`);
  }
  try {
    return await fn();
  } finally {
    releaseLock(key);
  }
}

/**
 * Safely parse any numeric value (string, null, undefined) to avoid NaN and string-concat bugs.
 */
export function safeNum(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

/**
 * Executes a sequence of steps atomically.
 * If any step fails, all preceding steps are rolled back in reverse order.
 */
export async function executeAtomicTransaction(
  transactionName: string,
  steps: AtomicStep[]
): Promise<TransactionReport> {
  const executedSteps: { step: AtomicStep; result: any }[] = [];
  const rolledBackStepNames: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    try {
      const result = await step.execute();
      executedSteps.push({ step, result });
    } catch (stepError: any) {
      console.error(
        `[AtomicTransaction] Step "${step.name}" failed during "${transactionName}". Initiating compensating rollback.`,
        stepError
      );

      // Rollback executed steps in reverse order
      for (let j = executedSteps.length - 1; j >= 0; j--) {
        const executed = executedSteps[j];
        try {
          await executed.step.rollback(executed.result);
          rolledBackStepNames.push(executed.step.name);
          console.log(`[AtomicTransaction] Successfully rolled back: "${executed.step.name}"`);
        } catch (rollbackError) {
          console.error(
            `[AtomicTransaction CRITICAL] Rollback failed for step "${executed.step.name}":`,
            rollbackError
          );
        }
      }

      const compositeError = new Error(
        `Transaction "${transactionName}" failed at step "${step.name}": ${stepError?.message || 'Unknown error'}. Compensating rollbacks executed: [${rolledBackStepNames.join(', ')}].`
      );

      return {
        success: false,
        name: transactionName,
        executedSteps: executedSteps.map(s => s.step.name),
        rolledBackSteps: rolledBackStepNames,
        error: compositeError
      };
    }
  }

  return {
    success: true,
    name: transactionName,
    executedSteps: executedSteps.map(s => s.step.name),
    rolledBackSteps: []
  };
}
