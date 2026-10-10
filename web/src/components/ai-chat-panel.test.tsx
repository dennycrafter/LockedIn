// @vitest-environment jsdom
// Interaction tests for the shared AI chat panel (SPEC 8.15, T8-UI): send
// flow, the 12 message cap, typed errors with retry that keeps the
// transcript, the always-available switch back to scripted, and the
// renderActions hook for actionable replies. fetch is stubbed at the global
// boundary; fixtures only, the running app never uses mock data (SPEC 0).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AiChatPanel } from "./ai-chat-panel";

type PanelProps = Parameters<typeof AiChatPanel>[0];

function renderPanel(overrides: Partial<PanelProps> = {}) {
  const props = {
    flow: "stuck" as const,
    context: {},
    introText: "Tell the coach what is going on.",
    sendLabel: "Message the AI coach",
    onSwitchToScripted: vi.fn(),
    ...overrides,
  };
  render(<AiChatPanel {...props} />);
  return props;
}

function typeAndSend(text: string) {
  fireEvent.change(screen.getByLabelText("Message the AI coach"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}

/** Sends and waits until the user entry shows up in the transcript. */
async function sendTurn(text: string) {
  typeAndSend(text);
  await waitFor(() => expect(screen.getByText(text)).toBeTruthy());
}

function okStuck(reply: string, start5min = false): Response {
  return new Response(JSON.stringify({ ok: true, flow: "stuck", reply, start5min, startRef: null }), { status: 200 });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AiChatPanel send flow", () => {
  it("sends the conversation to /api/ai and shows both transcript entries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okStuck("Name the smallest step."));
    vi.stubGlobal("fetch", fetchMock);
    const context = { undoneTasks: ["Launch > Write intro (task, id: t1)"] };
    renderPanel({ context });

    await sendTurn("I keep avoiding the doc");

    expect(screen.getByText("Name the smallest step.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          flow: "stuck",
          messages: [{ role: "user", content: "I keep avoiding the doc" }],
          context,
        }),
      }),
    );
  });

  it("starts a new conversation from the cap notice, clearing the transcript", async () => {
    // Fresh Response per call: a Response body can only be read once.
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => okStuck("ok")));
    renderPanel();

    // 12 messages = 6 user/assistant turns, matching the backend capMessages
    // semantics (one message per role turn).
    for (let turn = 1; turn <= 6; turn++) {
      await sendTurn(`message ${turn}`);
    }
    // The user entry renders before the reply lands; wait for all six replies
    // so the transcript is at the 12 message cap.
    await waitFor(() => expect(screen.getAllByText("ok").length).toBe(6));

    const input = screen.getByLabelText("Message the AI coach") as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(
      screen.getByText("12 message limit reached in this conversation. Start a new conversation to keep going."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Start a new conversation" }));
    expect((screen.getByLabelText("Message the AI coach") as HTMLInputElement).disabled).toBe(false);
    expect(screen.queryByText("message 6")).toBeNull();
  });

  it("keeps the transcript on error and retries without duplicating the user entry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: false, error: { code: "AI_PROVIDER_ERROR", message: "The AI helper is having trouble right now." } }),
          { status: 502 },
        ),
      )
      .mockResolvedValueOnce(okStuck("Back online."));
    vi.stubGlobal("fetch", fetchMock);
    renderPanel();

    await sendTurn("I keep avoiding the doc");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The AI helper is having trouble right now.");
    // Transcript survives the failure, user entry exactly once.
    expect(screen.getAllByText("I keep avoiding the doc").length).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(screen.getByText("Back online.")).toBeTruthy());
    expect(screen.getAllByText("I keep avoiding the doc").length).toBe(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("AiChatPanel mode and actions", () => {
  it("offers the switch back to scripted at all times", () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Switch to scripted" }));
    expect(props.onSwitchToScripted).toHaveBeenCalled();
  });

  it("hands the latest actionable reply to renderActions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            flow: "organize",
            reply: "Ranked it.",
            ranked: [{ title: "Write intro", task_id: "t1", reason: "Highest impact" }],
          }),
          { status: 200 },
        ),
      ),
    );
    const renderActions = vi.fn(() => <button type="button">Make #1 my most important task</button>);
    renderPanel({ flow: "organize", renderActions });

    await sendTurn("rank them");

    expect(renderActions).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Make #1 my most important task" })).toBeTruthy();
  });

  it("disables the input while a reply is pending", async () => {
    let resolveFetch: (value: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
      ),
    );
    renderPanel();

    typeAndSend("still here");
    await waitFor(() => expect((screen.getByLabelText("Message the AI coach") as HTMLInputElement).disabled).toBe(true));
    expect(screen.getByText("Thinking...")).toBeTruthy();

    resolveFetch(okStuck("done"));
    await waitFor(() => expect(screen.getByText("done")).toBeTruthy());
    expect((screen.getByLabelText("Message the AI coach") as HTMLInputElement).disabled).toBe(false);
  });
});
