// @vitest-environment jsdom
// Plan card (UI polish, Oct 2026): one card titled by the plan's day, misc
// tasks inside it, and never the "No plan yet" line while a plan is showing.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { TomorrowPlan } from "@/lib/tomorrow-plan";
import { chicagoDateKey } from "@/lib/time";
import { PlanPanel } from "./tomorrow-plan-panel";

function mockPlan(plan: TomorrowPlan | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ ok: true, plan }), { status: 200 })),
  );
}

function renderPanel() {
  render(
    <PlanPanel
      startDisabled={false}
      onToggleTask={() => undefined}
      onStartTask={() => undefined}
      onPlanCompleted={() => undefined}
      miscTasks={[{ id: "m1", title: "Buy groceries", done: false, position: 0 }]}
      onCreateMisc={() => undefined}
      onToggleMisc={() => undefined}
      onDeleteMisc={() => undefined}
      onReorderMisc={() => undefined}
      onStartMisc={() => undefined}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PlanPanel", () => {
  it("shows the plan with today's title and never the empty line", async () => {
    mockPlan({
      planDateKey: chicagoDateKey(new Date()),
      startTime: "09:00",
      location: "Library",
      prepped: true,
      rows: [
        { taskId: "t1", title: "Apply to roles", done: false, contextLabel: "Job search", position: 0 },
        { taskId: "t2", title: "Call recruiter", done: true, contextLabel: "Job search", position: 1 },
      ],
    });
    renderPanel();

    await waitFor(() => expect(screen.getByText("Apply to roles")).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Today's plan" })).toBeTruthy();
    expect(screen.getByText("Starts 09:00 · Library")).toBeTruthy();
    expect(screen.queryByText(/No plan yet/)).toBeNull();
    expect(screen.getByRole("button", { name: "Show 1 done" })).toBeTruthy();
    expect(screen.getByText("Buy groceries")).toBeTruthy();
  });

  it("says no plan yet only when there is none", async () => {
    mockPlan(null);
    renderPanel();

    await waitFor(() => expect(screen.getByText(/No plan yet/)).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Plan" })).toBeTruthy();
    expect(screen.getByText("Buy groceries")).toBeTruthy();
  });
});
