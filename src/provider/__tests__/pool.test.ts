import { ConnectionPool } from '../pool.ts';
import { XtreamClient } from '../xtream/client.ts';
import type { XtreamAccount } from '../xtream/types.ts';
import authFixture from '../../../__tests__/fixtures/xtream-auth.json';

function account(maxConnections: number, label: string): XtreamAccount {
  return {
    credentials: { baseUrl: `http://${label}.example.com`, username: 'USER', password: 'PASS', label },
    userInfo: { ...authFixture.user_info, max_connections: String(maxConnections) },
    serverInfo: authFixture.server_info,
    maxConnections,
    expiresAt: null,
  };
}

describe('ConnectionPool', () => {
  test('budget is the sum of maxConnections', () => {
    expect(new ConnectionPool([account(1, 'a'), account(2, 'b')]).budget).toBe(3);
    expect(new ConnectionPool([]).budget).toBe(0);
  });

  test('acquire hands out slots per account and returns null when exhausted', () => {
    const pool = new ConnectionPool([account(1, 'a'), account(2, 'b')]);
    const l1 = pool.acquire();
    const l2 = pool.acquire();
    const l3 = pool.acquire();
    expect(l1?.accountIndex).toBe(0);
    expect(l2?.accountIndex).toBe(1);
    expect(l3?.accountIndex).toBe(1);
    expect(pool.inUse).toBe(3);
    expect(pool.available).toBe(0);
    expect(pool.acquire()).toBeNull();
  });

  test('release frees the slot; double release is a no-op', () => {
    const pool = new ConnectionPool([account(1, 'a')]);
    const lease = pool.acquire();
    expect(lease).not.toBeNull();
    expect(pool.acquire()).toBeNull();
    lease!.release();
    expect(pool.inUse).toBe(0);
    lease!.release();
    expect(pool.inUse).toBe(0);
    expect(pool.acquire()).not.toBeNull();
    expect(pool.inUse).toBe(1);
  });

  test('clientFor returns a cached client bound to the lease account', () => {
    const pool = new ConnectionPool([account(1, 'a'), account(1, 'b')], { userAgent: 'Pitwall/1.0 (AndroidTV)' });
    const a = pool.acquire()!;
    const b = pool.acquire()!;
    const ca = pool.clientFor(a);
    const cb = pool.clientFor(b);
    expect(ca).toBeInstanceOf(XtreamClient);
    expect(ca.baseUrl).toBe('http://a.example.com');
    expect(cb.baseUrl).toBe('http://b.example.com');
    expect(pool.clientFor(a)).toBe(ca);
    expect(ca.streamHeaders()['User-Agent']).toBe('Pitwall/1.0 (AndroidTV)');
    expect(pool.accountFor(b).credentials.label).toBe('b');
  });

  test('zero-connection accounts never lease', () => {
    const pool = new ConnectionPool([account(0, 'dead'), account(1, 'ok')]);
    expect(pool.budget).toBe(1);
    expect(pool.acquire()?.accountIndex).toBe(1);
  });
});
