"use client";
import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { isDemoAdminEnabled } from "@/lib/config";
import { applyOverrides, getOverrides, subscribeOverrides } from "@/lib/data/demo-overrides";
import { buildLookups, type Lookups } from "@/lib/data/lookups";
import type { NavigatorData } from "@/lib/data/types";
import { buildGraph } from "@/lib/navigation";
import type { NavGraph } from "@/lib/navigation";
import { buildSearchIndex, type SearchIndex } from "@/lib/search/engine";

interface NavigatorContextValue {
  data: NavigatorData;
  lookups: Lookups;
  graph: NavGraph;
  searchIndex: SearchIndex;
  /** true when local-only demo-admin edits are being shown (development demo mode only) */
  hasLocalEdits: boolean;
}

const Ctx = createContext<NavigatorContextValue | null>(null);

const noopSubscribe = () => () => {};
const noOverrides = () => null;

/**
 * Receives the server-loaded dataset and derives lookup maps, the navigation graph and the search index once.
 * In development demo-admin mode it overlays the local-only edits from localStorage (never in production).
 */
export function DataProvider({ initialData, children }: { initialData: NavigatorData; children: ReactNode }) {
  const overrides = useSyncExternalStore(
    isDemoAdminEnabled ? subscribeOverrides : noopSubscribe,
    isDemoAdminEnabled ? getOverrides : noOverrides,
    noOverrides, // server snapshot: always the base data (avoids hydration mismatch)
  );
  const value = useMemo<NavigatorContextValue>(() => {
    const data = applyOverrides(initialData, overrides);
    return {
      data,
      lookups: buildLookups(data),
      graph: buildGraph(data.nodes, data.edges),
      searchIndex: buildSearchIndex(data),
      hasLocalEdits: overrides !== null,
    };
  }, [initialData, overrides]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNavigator(): NavigatorContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useNavigator must be used inside <DataProvider>");
  return v;
}
