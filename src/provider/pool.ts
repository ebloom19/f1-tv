import type { XtreamAccount } from './xtream/types.ts';
import { XtreamClient } from './xtream/client.ts';
import type { XtreamClientOptions } from './xtream/client.ts';

export interface SlotLease {
  accountIndex: number;
  release(): void;
}

/**
 * Leases concurrent-stream slots across one or more Xtream accounts.
 * Budget is Σ maxConnections; `acquire()` hands out the first account with a free slot.
 * Releasing a lease twice is a no-op.
 */
export class ConnectionPool {
  private readonly accounts: XtreamAccount[];
  private readonly used: number[];
  private readonly clients: (XtreamClient | undefined)[];
  private readonly clientOptions: XtreamClientOptions | undefined;

  constructor(accounts: XtreamAccount[], clientOptions?: XtreamClientOptions) {
    this.accounts = accounts.slice();
    this.used = accounts.map(() => 0);
    this.clients = accounts.map(() => undefined);
    this.clientOptions = clientOptions;
  }

  get budget(): number {
    return this.accounts.reduce((sum, a) => sum + Math.max(0, Math.trunc(a.maxConnections) || 0), 0);
  }

  get inUse(): number {
    return this.used.reduce((sum, n) => sum + n, 0);
  }

  get available(): number {
    return this.budget - this.inUse;
  }

  get accountCount(): number {
    return this.accounts.length;
  }

  accountAt(index: number): XtreamAccount | undefined {
    return this.accounts[index];
  }

  /** Returns a lease on the first account with a free slot, or null when the budget is exhausted. */
  acquire(): SlotLease | null {
    for (let i = 0; i < this.accounts.length; i++) {
      if (this.used[i] < Math.max(0, Math.trunc(this.accounts[i].maxConnections) || 0)) {
        this.used[i] += 1;
        let released = false;
        const release = (): void => {
          if (released) {
            return;
          }
          released = true;
          this.used[i] = Math.max(0, this.used[i] - 1);
        };
        return { accountIndex: i, release };
      }
    }
    return null;
  }

  clientFor(lease: SlotLease): XtreamClient {
    const i = lease.accountIndex;
    const account = this.accounts[i];
    if (!account) {
      throw new Error(`ConnectionPool: no account at index ${i}`);
    }
    let client = this.clients[i];
    if (!client) {
      client = new XtreamClient(account.credentials, this.clientOptions);
      this.clients[i] = client;
    }
    return client;
  }

  accountFor(lease: SlotLease): XtreamAccount {
    const account = this.accounts[lease.accountIndex];
    if (!account) {
      throw new Error(`ConnectionPool: no account at index ${lease.accountIndex}`);
    }
    return account;
  }
}
