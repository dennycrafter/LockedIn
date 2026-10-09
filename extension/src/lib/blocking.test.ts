// Tests for the pure parts of the DNR blocking module: rule shape (SPEC 12:
// reserved id range, main_frame redirect carrying ?site=) and the diff that
// keeps apply idempotent.
import { describe, expect, it } from "vitest";
import { RULE_ID_BASE, diffRules, isBlockingSession, rulesForDomains } from "./blocking";
import type { ActiveSession } from "./session";

function makeSession(lockMode: ActiveSession["lockMode"]): ActiveSession {
  return {
    id: "0b9e6c1e-0000-4000-8000-000000000001",
    projectId: null,
    taskId: null,
    miscTaskId: null,
    label: "",
    lockMode,
    plannedSeconds: 60,
    addedSeconds: 0,
    startedAtMs: 1_000_000,
    endAtMs: 1_060_000,
    pausedAtMs: null,
    pausedTotalMs: 0,
  };
}

describe("rulesForDomains", () => {
  it("builds one main_frame redirect rule per domain from the reserved range", () => {
    const rules = rulesForDomains(["youtube.com", "x.com"]);
    expect(rules).toHaveLength(2);
    expect(rules[0].id).toBe(RULE_ID_BASE); // 1000
    expect(rules[1].id).toBe(RULE_ID_BASE + 1);
    expect(rules[0].condition).toEqual({
      requestDomains: ["youtube.com"],
      resourceTypes: ["main_frame"],
    });
    expect(rules[0].action.type).toBe("redirect");
    expect(rules[0].action.redirect.extensionPath).toBe("/blocked.html?site=youtube.com");
  });

  it("caps at the reserved range size", () => {
    const rules = rulesForDomains(Array.from({ length: 1500 }, (_, i) => `site${i}.example.com`));
    expect(rules).toHaveLength(1000);
    expect(rules[rules.length - 1].id).toBe(1999);
  });
});

describe("isBlockingSession", () => {
  it("blocks for soft and hard locks, not for none or no session", () => {
    expect(isBlockingSession(makeSession("hard"))).toBe(true);
    expect(isBlockingSession(makeSession("soft"))).toBe(true);
    expect(isBlockingSession(makeSession("none"))).toBe(false);
    expect(isBlockingSession(null)).toBe(false);
  });
});

describe("diffRules", () => {
  it("adds missing rules and removes stale ones", () => {
    const wanted = rulesForDomains(["a.com", "b.com"]); // ids 1000, 1001
    // Installed rules from an older list: a.com still there, plus a stale
    // rule that owns a slot the new list no longer uses.
    const stale = { ...rulesForDomains(["c.com"])[0], id: 1042 };
    const { removeIds, addRules } = diffRules([wanted[0], stale], wanted);
    expect(removeIds).toEqual([1042]);
    expect(addRules).toEqual([wanted[1]]);
  });

  it("is idempotent when rules already match", () => {
    const wanted = rulesForDomains(["a.com", "b.com"]);
    const { removeIds, addRules } = diffRules(wanted, wanted);
    expect(removeIds).toEqual([]);
    expect(addRules).toEqual([]);
  });

  it("removes everything when blocking ends", () => {
    const current = rulesForDomains(["a.com", "b.com"]);
    const { removeIds, addRules } = diffRules(current, []);
    expect(removeIds).toEqual(current.map((rule) => rule.id));
    expect(addRules).toEqual([]);
  });
});
