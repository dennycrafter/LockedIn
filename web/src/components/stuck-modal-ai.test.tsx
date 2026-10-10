// @vitest-environment jsdom
// AI mode tests for the stuck modal (SPEC 8.15, T8-UI): the opt-in toggle
// keeps the scripted answers, a START_5_MIN reply offers the 5 minute session
// through the existing start dialog handoff, typed errors retry without
// losing the transcript, and cancelling mid-request lands back on a fresh
// scripted flow. /api/ai is stubbed at the global fetch boundary; no real
// Anthropic call ever happens (SPEC 0, fixtures only).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ProjectData, TaskData } from "@/lib/dashboard-data";
import { StuckModal } from "./stuck-modal";

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

type ModalProps = Parameters<typeof StuckModal>[0];

function renderModal(overrides: Partial<ModalProps> = {}) {
  const props = {
    projects: PROJECTS,
    onToast: vi.fn(),
    onChanged: vi.fn(),
    onStartTask: vi.fn(),
    ...overrides,
  };
  render(<StuckModal {...props} />);
  return props;
}

function openAiMode() {
  fireEvent.click(screen.getByRole("button", { name: "Help me start" }));
  fireEvent.click(screen.getByRole("button", { name: "Ask AI to coach me instead" }));
}

function aiResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const STUCK_REPLY = {
  ok: true,
  flow: "stuck",
  reply: "Open the doc and write one ugly sentence.",
  start5min: true,
  startRef: "Write intro",
};

/** Sends one chat message and waits for the assistant reply to render. */
async function sendAndWait(text: string, expectReply: string) {
  fireEvent.change(screen.getByLabelText("Message the AI coach"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(screen.getByText(expectReply)).toBeTruthy());
}

function fetchBody(call: number): { flow: string; messages: Array<{ role: string; content: string }>; context: { undoneTasks?: string[] } } {
  const fetchMock = vi.mocked(fetch);
  return JSON.parse(fetchMock.mock.calls[call][1]?.body as string);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StuckModal AI opt-in", () => {
  it("switches to the AI chat and back, keeping the scripted state", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Help me start" }));
    fireEvent.change(screen.getByLabelText("What have you worked on so far?"), { target: { value: "an outline" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask AI to coach me instead" }));

    expect(screen.getByText("AI coach mode")).toBeTruthy();
    expect(
      screen.getByText("Tell the coach what is going on. It will help you name one tiny first step, then offer a 5 minute session."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Switch to scripted" }));
    expect(screen.getByText("First, a quick check-in.")).toBeTruthy();
    expect((screen.getByLabelText("What have you worked on so far?") as HTMLInputElement).value).toBe("an outline");
  });

  it("sends the stuck flow with undone task context carrying ids", async () => {
    const fetchMock = vi.fn().mockResolvedValue(aiResponse(STUCK_REPLY));
    vi.stubGlobal("fetch", fetchMock);
    renderModal();
    openAiMode();

    fireEvent.change(screen.getByLabelText("Which task are you stuck on?"), { target: { value: "t1" } });
    await sendAndWait("I keep avoiding the doc", "Open the doc and write one ugly sentence.");

    const body = fetchBody(0);
    expect(body.flow).toBe("stuck");
    expect(body.messages).toEqual([{ role: "user", content: "I keep avoiding the doc" }]);
    expect(body.context?.undoneTasks).toEqual(["Launch > Write intro (task, id: t1)"]);
  });
});

describe("StuckModal AI start handoff", () => {
  it("offers the 5 minute session on a START_5_MIN reply and hands the picked task over", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(aiResponse(STUCK_REPLY)));
    const props = renderModal();
    openAiMode();

    fireEvent.change(screen.getByLabelText("Which task are you stuck on?"), { target: { value: "t1" } });
    await sendAndWait("I keep avoiding the doc", "Open the doc and write one ugly sentence.");

    fireEvent.click(screen.getByRole("button", { name: "Start 5 minutes" }));
    expect(props.onStartTask).toHaveBeenCalledWith("t1");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the start dialog clean when no task is picked", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(aiResponse(STUCK_REPLY)));
    const props = renderModal();
    openAiMode();

    await sendAndWait("avoiding everything", "Open the doc and write one ugly sentence.");
    fireEvent.click(screen.getByRole("button", { name: "Start 5 minutes" }));
    expect(props.onStartTask).toHaveBeenCalledWith(null);
  });

  it("shows no start button while the AI has not offered the marker", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        aiResponse({ ok: true, flow: "stuck", reply: "What makes it hard right now?", start5min: false, startRef: null }),
      ),
    );
    renderModal();
    openAiMode();

    await sendAndWait("the opening paragraph", "What makes it hard right now?");
    expect(screen.queryByRole("button", { name: "Start 5 minutes" })).toBeNull();
  });
});

describe("StuckModal AI errors and cancel", () => {
  it("surfaces the typed error inline and retries with the transcript intact", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        aiResponse({ ok: false, error: { code: "AI_NOT_CONFIGURED", message: "Add your Anthropic key in Vercel to turn this on." } }, 503),
      )
      .mockResolvedValueOnce(aiResponse(STUCK_REPLY));
    vi.stubGlobal("fetch", fetchMock);
    renderModal();
    openAiMode();

    await sendAndWait("I keep avoiding the doc", "I keep avoiding the doc");
    expect((await screen.findByRole("alert")).textContent).toContain("Add your Anthropic key in Vercel to turn this on.");
    expect(screen.queryByRole("button", { name: "Start 5 minutes" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(screen.getByText("Open the doc and write one ugly sentence.")).toBeTruthy());
    expect(screen.getAllByText("I keep avoiding the doc").length).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchBody(1).messages).toEqual([{ role: "user", content: "I keep avoiding the doc" }]);
  });

  it("cancels mid request and starts over in scripted mode on reopen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise<Response>(() => {
          // Never resolves: the request is still in flight when the modal closes.
        }),
      ),
    );
    renderModal();
    openAiMode();

    fireEvent.change(screen.getByLabelText("Message the AI coach"), { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    // A fresh open starts over: scripted check-in, empty answers.
    fireEvent.click(screen.getByRole("button", { name: "Help me start" }));
    expect(screen.getByText("First, a quick check-in.")).toBeTruthy();
    expect((screen.getByLabelText("What have you worked on so far?") as HTMLInputElement).value).toBe("");
  });
});
