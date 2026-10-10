// @vitest-environment jsdom
// AI mode tests for the organize modal (SPEC 8.15, T8-UI): the opt-in toggle
// keeps the scripted dump state, the ranked reply renders from the parsed
// list (raw JSON never shown), confirm-then-write posts to the existing
// day-plan route, and unmappable suggestions disable the plan action.
// /api/ai is stubbed at the global fetch boundary; no real Anthropic call
// ever happens (SPEC 0, fixtures only).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MiscTaskData, ProjectData, TaskData } from "@/lib/dashboard-data";
import { OrganizeModal } from "./organize-modal";

function task(overrides: Partial<TaskData> = {}): TaskData {
  return {
    id: "t1",
    project_id: "p1",
    parent_task_id: null,
    title: "Write intro",
    done: false,
    notes: "",
    position: 0,
    links: [],
    snippets: [],
    subtasks: [],
    ...overrides,
  };
}

function miscTask(overrides: Partial<MiscTaskData> = {}): MiscTaskData {
  return {
    id: "m1",
    title: "Email the accountant",
    done: false,
    position: 0,
    ...overrides,
  };
}

function project(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    id: "p1",
    name: "Launch",
    notes: "",
    position: 0,
    links: [],
    snippets: [],
    tasks: [],
    ...overrides,
  };
}

const PROJECTS: ProjectData[] = [
  project({
    tasks: [task({ id: "t1", title: "Write intro" })],
  }),
];

type ModalProps = Parameters<typeof OrganizeModal>[0];

function renderModal(overrides: Partial<ModalProps> = {}) {
  const props = {
    projects: PROJECTS,
    miscTasks: [miscTask()],
    onToast: vi.fn(),
    onChanged: vi.fn(),
    onStartItem: vi.fn(),
    ...overrides,
  };
  render(<OrganizeModal {...props} />);
  return props;
}

function openAiMode() {
  fireEvent.click(screen.getByRole("button", { name: "Organize" }));
  fireEvent.click(screen.getByRole("button", { name: "Let AI organize instead" }));
}

function aiResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function rankedReply(ranked: Array<{ title: string; task_id: string | null; reason: string }>) {
  return aiResponse({ ok: true, flow: "organize", reply: "Ranked. Start at the top.", ranked });
}

/** Sends one chat message and waits for the assistant reply to render. */
async function sendAndWait(text: string, expectReply: string) {
  fireEvent.change(screen.getByLabelText("Message the AI organizer"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(screen.getByText(expectReply)).toBeTruthy());
}

/** Finds an interactive element by accessible name inside a dialog. */
function namedIn(dialog: HTMLElement, name: string): HTMLElement {
  const target = Array.from(dialog.querySelectorAll<HTMLElement>("button, input")).find(
    (el) => (el.getAttribute("aria-label") ?? el.textContent ?? "").trim() === name,
  );
  if (!target) throw new Error(`No element named ${name} in dialog`);
  return target;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OrganizeModal AI opt-in", () => {
  it("switches to the AI chat and back, keeping the scripted dump state", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Organize" }));
    const dialog = screen.getByRole("dialog");

    fireEvent.click(namedIn(dialog, "Include in ranking: Launch > Write intro"));
    fireEvent.click(namedIn(dialog, "Let AI organize instead"));

    expect(screen.getByText("AI organize mode")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Switch to scripted" }));

    const backInScripted = screen.getByRole("dialog");
    expect((namedIn(backInScripted, "Include in ranking: Launch > Write intro") as HTMLInputElement).checked).toBe(true);
  });

  it("sends the organize flow with undone task context carrying ids", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(rankedReply([{ title: "Write intro", task_id: "t1", reason: "Highest impact" }]));
    vi.stubGlobal("fetch", fetchMock);
    renderModal();
    openAiMode();

    await sendAndWait("rank my list", "Ranked. Start at the top.");

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.flow).toBe("organize");
    expect(body.messages).toEqual([{ role: "user", content: "rank my list" }]);
    expect(body.context?.undoneTasks).toEqual([
      "Launch > Write intro (task, id: t1)",
      "Email the accountant (misc, id: m1)",
    ]);
  });
});

describe("OrganizeModal AI ranked actions", () => {
  it("renders the ranked list and confirms before writing the day plan", async () => {
    // Fresh Response per call and routed by URL: /api/ai for the chat, the
    // day-plan route only when the confirm button writes.
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/day-plans/most-important") {
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      }
      return Promise.resolve(rankedReply([{ title: "Write intro", task_id: "t1", reason: "Highest impact" }]));
    });
    vi.stubGlobal("fetch", fetchMock);
    const props = renderModal();
    openAiMode();

    await sendAndWait("rank my list", "Ranked. Start at the top.");

    expect(screen.getByText("#1 Write intro")).toBeTruthy();
    expect(screen.getByText("Highest impact")).toBeTruthy();
    // Raw JSON never shows in the chat.
    expect(screen.queryByText(/"ranked"/)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/day-plans/most-important", expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "Make #1 my most important task" }));

    await waitFor(() => expect(props.onToast).toHaveBeenCalledWith("Most important task set"));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/day-plans/most-important",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ taskId: "t1" }) }),
    );
    expect(props.onChanged).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("disables the plan action when the top item is not in the dump", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(rankedReply([{ title: "Ghost task", task_id: null, reason: "Sounds big" }])),
    );
    renderModal();
    openAiMode();

    await sendAndWait("rank", "Ranked. Start at the top.");

    expect(screen.getByText("#1 Ghost task")).toBeTruthy();
    expect(screen.getByText("The AI suggested a task that is not in your list.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Make #1 my most important task" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Start it now" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("blocks planning a misc top item but starts a timer on it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(rankedReply([{ title: "Email the accountant", task_id: "m1", reason: "Quick win" }])),
    );
    const props = renderModal();
    openAiMode();

    await sendAndWait("rank", "Ranked. Start at the top.");

    expect((screen.getByRole("button", { name: "Make #1 my most important task" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Misc tasks cannot go in the plan. Start a timer on them instead.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Start it now" }));
    expect(props.onStartItem).toHaveBeenCalledTimes(1);
  });
});
