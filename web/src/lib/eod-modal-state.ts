// State machine for the EOD preview modal (SPEC 8.13). Pure so the failure
// path (keep the preview open, show the error) is testable without a DOM.

import type { EodContext, EodDayData } from "./eod-report";

export type EodGetResponse =
  | { ok: true; context: EodContext; data: EodDayData }
  | { ok: false; error: string };

export type EodSendResponse = { ok: true } | { ok: false; error: string };

export type EodModalStatus = "closed" | "loading" | "error" | "ready" | "sending";

export type EodModalState = {
  status: EodModalStatus;
  loadError: string | null;
  sendError: string | null;
  toast: string | null;
  context: EodContext | null;
  data: EodDayData | null;
  doneToday: string;
  learned: string;
};

export type EodModalEvent =
  | { type: "open" }
  | { type: "close" }
  | { type: "load-success"; context: EodContext; data: EodDayData }
  | { type: "load-failure"; error: string }
  | { type: "edit-done"; value: string }
  | { type: "edit-learned"; value: string }
  | { type: "send-start" }
  | { type: "send-success" }
  | { type: "send-failure"; error: string }
  | { type: "toast-hidden" };

export function eodModalInitialState(): EodModalState {
  return {
    status: "closed",
    loadError: null,
    sendError: null,
    toast: null,
    context: null,
    data: null,
    doneToday: "",
    learned: "",
  };
}

export function eodModalReducer(state: EodModalState, event: EodModalEvent): EodModalState {
  switch (event.type) {
    case "open":
      // Reopening always refetches so the preview reflects current data.
      return { ...eodModalInitialState(), status: "loading" };
    case "close":
      return { ...state, status: "closed" };
    case "load-success":
      return {
        ...state,
        status: "ready",
        loadError: null,
        context: event.context,
        data: event.data,
        // SPEC 8.13: the two editable fields prefill from day_reviews.
        doneToday: event.data.review?.doneToday ?? "",
        learned: event.data.review?.learned ?? "",
      };
    case "load-failure":
      return { ...state, status: "error", loadError: event.error };
    case "edit-done":
      return { ...state, doneToday: event.value };
    case "edit-learned":
      return { ...state, learned: event.value };
    case "send-start":
      return { ...state, status: "sending", sendError: null };
    case "send-success":
      return { ...state, status: "closed", sendError: null, toast: "Report sent" };
    case "send-failure":
      // SPEC 8.13: on failure show the error text and keep the preview open,
      // with the owner's edits intact.
      return { ...state, status: "ready", sendError: event.error };
    case "toast-hidden":
      return { ...state, toast: null };
  }
}
