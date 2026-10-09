import { describe, expect, it } from "vitest";
import {
  eodModalInitialState,
  eodModalReducer,
  type EodModalState,
} from "./eod-modal-state";
import { getEodContext, type EodDayData } from "./eod-report";

function readyState(): EodModalState {
  const context = getEodContext(new Date("2026-10-09T18:00:00.000Z"));
  const data: EodDayData = {
    sessions: [{ activeSeconds: 1500, startedAt: "2026-10-09T14:00:00.000Z", label: "Write intro" }],
    infractions: [],
    timeStudies: [],
    review: { doneToday: "Draft outline", learned: "", finishedGoal: null, bestUse: null, bestUseNote: "" },
    plan: null,
  };
  return eodModalReducer(eodModalReducer(eodModalInitialState(), { type: "open" }), {
    type: "load-success",
    context,
    data,
  });
}

describe("EOD preview modal state", () => {
  it("starts closed with no errors or toast", () => {
    const state = eodModalInitialState();
    expect(state.status).toBe("closed");
    expect(state.toast).toBeNull();
  });

  it("prefills the editable fields from the day review", () => {
    const state = readyState();
    expect(state.status).toBe("ready");
    expect(state.doneToday).toBe("Draft outline");
    expect(state.learned).toBe("");
  });

  it("keeps the preview open on send failure and shows the error", () => {
    // SPEC 8.13: on failure show the error text, keep the preview open.
    const ready = readyState();
    const edited = eodModalReducer(ready, { type: "edit-done", value: "Edited before sending" });
    const sending = eodModalReducer(edited, { type: "send-start" });
    expect(sending.status).toBe("sending");

    const failed = eodModalReducer(sending, {
      type: "send-failure",
      error: "You can only send testing emails to your own email address",
    });
    expect(failed.status).toBe("ready");
    expect(failed.sendError).toBe("You can only send testing emails to your own email address");
    // The preview content and the owner's edits survive the failure.
    expect(failed.data).toBe(ready.data);
    expect(failed.doneToday).toBe("Edited before sending");
    expect(failed.toast).toBeNull();
  });

  it("closes with the Report sent toast on success", () => {
    const sending = eodModalReducer(readyState(), { type: "send-start" });
    const sent = eodModalReducer(sending, { type: "send-success" });
    expect(sent.status).toBe("closed");
    expect(sent.toast).toBe("Report sent");
    expect(sent.sendError).toBeNull();
  });

  it("clears the toast on the toast-hidden event", () => {
    const sent = eodModalReducer(eodModalReducer(readyState(), { type: "send-start" }), {
      type: "send-success",
    });
    expect(eodModalReducer(sent, { type: "toast-hidden" }).toast).toBeNull();
  });

  it("shows load errors and recovers on reopen", () => {
    const loading = eodModalReducer(eodModalInitialState(), { type: "open" });
    const errored = eodModalReducer(loading, { type: "load-failure", error: "sessions query failed: boom" });
    expect(errored.status).toBe("error");
    expect(errored.loadError).toBe("sessions query failed: boom");
    const reopened = eodModalReducer(errored, { type: "open" });
    expect(reopened.status).toBe("loading");
    expect(reopened.loadError).toBeNull();
  });

  it("closing leaves no stale state behind on the next open", () => {
    const ready = readyState();
    const closed = eodModalReducer(ready, { type: "close" });
    expect(closed.status).toBe("closed");
    const reopened = eodModalReducer(closed, { type: "open" });
    expect(reopened.status).toBe("loading");
    expect(reopened.sendError).toBeNull();
    expect(reopened.data).toBeNull();
  });
});
