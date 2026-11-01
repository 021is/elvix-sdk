"use client";

/**
 * The people of one business (`legal-entity-person.ts`): read when its
 * detail view opens, and every write. A failed write keeps the form open
 * with its worded cause; a failed read says so with a retry.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useElvixContext } from "./elvix-provider";
import type { LegalEntityPerson, PersonInput } from "./legal-entity-person";
import { type Outcome, profileCollection } from "./profile-request";

type Input = Partial<PersonInput> & { entityId?: string };

export function useLegalEntityPeople(entityId: string) {
  const { baseUrl } = useElvixContext();
  const api = useMemo(
    () => profileCollection<LegalEntityPerson, Input>(baseUrl, "entities/people", "people"),
    [baseUrl],
  );
  const [people, setPeople] = useState<LegalEntityPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const list = await api.list(`?entityId=${encodeURIComponent(entityId)}`, signal);
      if (signal?.aborted) return;
      setLoading(false);
      setLoadFailed(list === null);
      if (list) setPeople(list);
    },
    [api, entityId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  /** Runs a write, then re-reads the list on success. */
  const write = async (run: () => Promise<Outcome>): Promise<Outcome> => {
    const out = await run();
    if (out.ok) await reload();
    return out;
  };

  return {
    people,
    loading,
    loadFailed,
    reload: () => void reload(),
    add: (input: Partial<PersonInput>) => write(() => api.create({ ...input, entityId })),
    update: (id: string, input: Partial<PersonInput>) => write(() => api.update(id, input)),
    remove: (id: string) => write(() => api.remove(id)),
  };
}
