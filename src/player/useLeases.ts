import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectionPool, SlotLease } from '../provider/pool';
import type { SourceId } from '../multiview/types';

export type LeaseMap = Readonly<Record<SourceId, SlotLease>>;

const SEP = '\u001f'; // ASCII unit separator: never appears in a SourceId

/**
 * Holds one `SlotLease` per visible source id. Leases for ids that disappear are released
 * immediately; everything is released on unmount or via `releaseAll()` (idempotent).
 */
export function useLeases(
  pool: ConnectionPool,
  sourceIds: readonly SourceId[],
): { leases: LeaseMap; releaseAll: () => void } {
  const held = useRef<Map<SourceId, SlotLease>>(new Map());
  const [leases, setLeases] = useState<LeaseMap>({});
  const key = sourceIds.join(SEP);

  const publish = useCallback(() => {
    const next: Record<SourceId, SlotLease> = {};
    held.current.forEach((lease, id) => {
      next[id] = lease;
    });
    setLeases(next);
  }, []);

  const releaseAll = useCallback(() => {
    if (held.current.size === 0) {
      return;
    }
    held.current.forEach(lease => lease.release());
    held.current.clear();
    publish();
  }, [publish]);

  useEffect(() => {
    const wanted = key.length ? key.split(SEP) : [];
    let changed = false;
    // Release first so a swapped source can reuse the freed slot.
    held.current.forEach((lease, id) => {
      if (!wanted.includes(id)) {
        lease.release();
        held.current.delete(id);
        changed = true;
      }
    });
    for (const id of wanted) {
      if (!held.current.has(id)) {
        const lease = pool.acquire();
        if (lease) {
          held.current.set(id, lease);
          changed = true;
        }
      }
    }
    if (changed) {
      publish();
    }
  }, [key, pool, publish]);

  useEffect(() => {
    const map = held.current;
    return () => {
      map.forEach(lease => lease.release());
      map.clear();
    };
  }, []);

  return { leases, releaseAll };
}

export default useLeases;
