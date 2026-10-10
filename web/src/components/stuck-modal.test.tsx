// @vitest-environment jsdom
// Modal interaction tests for the scripted stuck flow (T7b): steps, cancel
// paths (X, Escape, outside click) and the start dialog handoff. The two
// fetch-backed actions are stubbed at the global fetch boundary; fixtures
// only, the running app never uses mock data (SPEC 0).

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
    tasks: [
      task({ id: "t1", title: "Write intro" }),
      task({ id: "t2", title: "Done thing", done: true }),
      task({
        id: "t3",
        title: "Record demo",
        subtasks: [task({ id: "s1", parent_task_id: "t3", title: "Plug in the mic" })],
      }),
    ],
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

function openModal() {
  fireEvent.click(screen.getByRole("button", { name: "Help me start" }));
  return screen.getByRole("dialog", { name: "I'm stuck, help me start" });
}

/** Move to the suggestion step, optionally answering step 1 first. */
function openSuggestion({ taskId, workedOn }: { taskId?: string; workedOn?: string } = {}) {
  const props = renderModal();
  openModal();
  if (taskId) {
    fireEvent.change(screen.getByLabelText("Which task are you stuck on?"), { target: { value: taskId } });
  }
  if (workedOn) {
    fireEvent.change(screen.getByLabelText("What have you worked on so far?"), { target: { value: workedOn } });
  }
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  return props;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StuckModal steps", () => {
  it("opens fresh from the panel affordance into the check-in step", () => {
    renderModal();
    expect(screen.queryByRole("dialog")).toBeNull();
    openModal();
    expect(screen.getByLabelText("Which task are you stuck on?")).toBeTruthy();
    expect(screen.getByLabelText("What have you worked on so far?")).toBeTruthy();
    expect(screen.getByLabelText("Where exactly are you stuck?")).toBeTruthy();
    // Done tasks are never offered in the picker.
    expect(screen.getByRole("option", { name: "Launch > Write intro" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Launch > Done thing" })).toBeNull();
    expect(screen.getByRole("option", { name: "Launch > Record demo > Plug in the mic" })).toBeTruthy();
  });

  it("shows the start suggestion for the empty-answers default", () => {
    renderModal();
    openModal();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Start a 5 minute mini session")).toBeTruthy();
  });

  it("shows the break-down suggestion when work was done", () => {
    renderModal();
    openModal();
    fireEvent.change(screen.getByLabelText("What have you worked on so far?"), {
      target: { value: "drafted two paragraphs" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Shrink it to one smaller next step")).toBeTruthy();
  });

  it("shows the park suggestion when everything was tried", () => {
    renderModal();
    openModal();
    fireEvent.click(screen.getByRole("button", { name: "Everything I can think of" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Park it and come back fresh")).toBeTruthy();
  });

  it("keeps answers when going back and re-derives the suggestion", () => {
    renderModal();
    openModal();
    fireEvent.change(screen.getByLabelText("What have you worked on so far?"), { target: { value: "an outline" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    const workedOn = screen.getByLabelText("What have you worked on so far?") as HTMLInputElement;
    expect(workedOn.value).toBe("an outline");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Shrink it to one smaller next step")).toBeTruthy();
  });
});

describe("StuckModal cancel paths", () => {
  it("closes on X, Escape and outside click on the check-in step", () => {
    renderModal();
    openModal();
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    openModal();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    openModal();
    const dialog = screen.getByRole("dialog");
    fireEvent.mouseDown(dialog.parentElement!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on Escape and outside click on the suggestion step", () => {
    renderModal();
    openModal();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    openModal();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.mouseDown(dialog.parentElement!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("StuckModal start dialog handoff", () => {
  it("hands the picked task to the start dialog and closes", () => {
    const props = openSuggestion({ taskId: "t1" });
    fireEvent.click(screen.getByRole("button", { name: "Start 5 minutes" }));
    expect(props.onStartTask).toHaveBeenCalledWith("t1");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("hands a subtask pick off as its top-level parent task", () => {
    const props = renderModal();
    openModal();
    fireEvent.change(screen.getByLabelText("Which task are you stuck on?"), { target: { value: "s1" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Start 5 minutes" }));
    expect(props.onStartTask).toHaveBeenCalledWith("t3");
  });

  it("opens the dialog without a task when none was picked", () => {
    const props = openSuggestion();
    fireEvent.click(screen.getByRole("button", { name: "Start 5 minutes" }));
    expect(props.onStartTask).toHaveBeenCalledWith(null);
  });
});

describe("StuckModal break-down quick-add", () => {
  it("posts the subtask to the tasks route and closes on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const props = openSuggestion({ taskId: "t1", workedOn: "an outline" });

    fireEvent.change(screen.getByLabelText("Smallest next step (saved as a subtask)"), {
      target: { value: "Open the doc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add subtask" }));

    await waitFor(() => expect(props.onChanged).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ projectId: "p1", parentId: "t1", title: "Open the doc" }),
      }),
    );
    expect(props.onToast).toHaveBeenCalledWith("Subtask added");
    expect(props.onStartTask).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays open with the route error when the save fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "Task title is required." }) }),
    );
    const props = openSuggestion({ taskId: "t1", workedOn: "an outline" });

    fireEvent.change(screen.getByLabelText("Smallest next step (saved as a subtask)"), {
      target: { value: "Open the doc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add subtask" }));

    await waitFor(() => expect(screen.getByText("Task title is required.")).toBeTruthy());
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(props.onChanged).not.toHaveBeenCalled();
  });
});

describe("StuckModal park as open loop", () => {
  it("prefills the loop text and posts it to the open-loops route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const props = renderModal();
    openModal();
    fireEvent.change(screen.getByLabelText("Which task are you stuck on?"), { target: { value: "t1" } });
    fireEvent.change(screen.getByLabelText("Where exactly are you stuck?"), { target: { value: "the hook" } });
    fireEvent.click(screen.getByRole("button", { name: "Everything I can think of" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    const loopInput = screen.getByLabelText("Open loop text") as HTMLInputElement;
    expect(loopInput.value).toBe('Stuck on "Write intro": the hook');
    fireEvent.click(screen.getByRole("button", { name: "Park it as an open loop" }));

    await waitFor(() => expect(props.onChanged).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/open-loops",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ kind: "loop", text: 'Stuck on "Write intro": the hook' }),
      }),
    );
    expect(props.onToast).toHaveBeenCalledWith("Open loop saved");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
