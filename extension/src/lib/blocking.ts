// DNR blocking (SPEC 8.5, SPEC 12): one dynamic rule per blocked domain while
// a blocking session is active, redirecting main frames to the block page.
// Rule IDs stay in the reserved 1000-1999 range (lockedin-owned); rules are
// removed by ID when blocking ends. Pure diff logic is separated from the
// chrome API calls so it can be unit tested.

import type { ActiveSession } from "./session";

export const BLOCKED_PAGE = "/blocked.html";
export const RULE_ID_BASE = 1000;
export const MAX_RULES = 1000; // reserved range size: 1000..1999

export interface DnrRule {
  id: number;
  priority: number;
  action: { type: "redirect"; redirect: { extensionPath: string } };
  condition: { requestDomains: string[]; resourceTypes: ["main_frame"] };
}

/** One redirect rule per domain, ids assigned from the reserved range in order. */
export function rulesForDomains(domains: string[]): DnrRule[] {
  return domains.slice(0, MAX_RULES).map((domain, index) => ({
    id: RULE_ID_BASE + index,
    priority: 1,
    action: {
      type: "redirect" as const,
      // The block page reads ?site= to show which domain was blocked; the
      // page itself logs the infraction (SPEC 8.5).
      redirect: { extensionPath: `${BLOCKED_PAGE}?site=${encodeURIComponent(domain)}` },
    },
    condition: { requestDomains: [domain], resourceTypes: ["main_frame"] as ["main_frame"] },
  }));
}

export function isBlockingSession(session: ActiveSession | null): boolean {
  return session !== null && session.lockMode !== "none";
}

/**
 * Diff two rule sets so an apply never duplicates or leaves orphans. Returns
 * the ids to remove (owned ids no longer wanted) and the rules to add.
 */
export function diffRules(
  current: { id: number }[],
  wanted: DnrRule[],
): { removeIds: number[]; addRules: DnrRule[] } {
  const wantedIds = new Set(wanted.map((rule) => rule.id));
  const removeIds = current.filter((rule) => !wantedIds.has(rule.id)).map((rule) => rule.id);
  const currentIds = new Set(current.map((rule) => rule.id));
  const addRules = wanted.filter((rule) => !currentIds.has(rule.id));
  return { removeIds, addRules };
}

/** True when an error is just "nothing to remove", safe to ignore. */
export function isNoRulesError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("No rules with IDs");
}

/** Applies the wanted rules for a domain list through the DNR API. */
export async function applyBlockingRules(domains: string[]): Promise<void> {
  const wanted = rulesForDomains(domains);
  const current = await chrome.declarativeNetRequest.getDynamicRules();
  const { removeIds, addRules } = diffRules(current, wanted);
  if (removeIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: removeIds,
      addRules: [],
    });
  }
  if (addRules.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: addRules.map((rule) => rule.id),
      addRules,
    });
  }
}

/** Removes every LockedIn-owned dynamic rule. */
export async function clearBlockingRules(): Promise<void> {
  const current = await chrome.declarativeNetRequest.getDynamicRules();
  const owned = current.filter(
    (rule) => rule.id >= RULE_ID_BASE && rule.id < RULE_ID_BASE + MAX_RULES,
  );
  if (owned.length === 0) return;
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: owned.map((rule) => rule.id),
      addRules: [],
    });
  } catch (error) {
    if (!isNoRulesError(error)) throw error;
  }
}
