// Right-click capture picker (SPEC 8.7): a small extension window listing the
// cached project/task/subtask tree, the captured text and an optional context
// box. Add queues the snippet with source "page" and the page URL appended to
// the context; the dashboard flushes the queue through drainQueue later, so
// this page never talks to the network.

import { buildPageSnippet } from "./lib/capture";
import { enqueueSnippet } from "./lib/queue";
import { getQueue, getTree, setQueue } from "./lib/storage";
import { flattenPickerOptions, ownerOfCode, type PickerOption } from "./lib/tree";

const PICKER_CODE_PATTERN = /^[pts]:.+$/;

function text(id: string, value: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setStatus(message: string, isError: boolean): void {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("error", isError);
}

function defaultCode(options: PickerOption[]): string {
  return options[0]?.code ?? "";
}

function readParams(): { text: string; url: string; title: string } {
  const params = new URLSearchParams(window.location.search);
  return {
    text: params.get("text") ?? "",
    url: params.get("url") ?? "",
    title: params.get("title") ?? "",
  };
}

async function addSnippet(): Promise<void> {
  const target = document.getElementById("target") as HTMLSelectElement | null;
  const contextBox = document.getElementById("context") as HTMLTextAreaElement | null;
  const add = document.getElementById("add") as HTMLButtonElement | null;
  if (!target || !contextBox || !add) return;

  const params = readParams();
  const selected = target.value;
  if (!PICKER_CODE_PATTERN.test(selected)) {
    setStatus("Open your LockedIn dashboard once so it can load the task list.", true);
    return;
  }
  const tree = await getTree();
  const owner = ownerOfCode(flattenPickerOptions(tree), selected);
  if (!owner) {
    setStatus("That item disappeared. Reopen the dashboard to refresh the list.", true);
    return;
  }

  const snippet = buildPageSnippet({
    id: crypto.randomUUID(),
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    text: params.text,
    url: params.url,
    context: contextBox.value,
    capturedAt: new Date().toISOString(),
  });
  const queue = await getQueue();
  await setQueue(enqueueSnippet(queue, snippet));

  add.disabled = true;
  setStatus("Added. Open your LockedIn dashboard to sync it into your notes.", false);
  // The capture is one shot: show the status, then close the small window.
  setTimeout(() => {
    window.close();
  }, 1600);
}

async function init(): Promise<void> {
  const params = readParams();
  text("captured-from", params.title !== "" ? `Captured from: ${params.title}` : "");
  text("selection", params.text !== "" ? params.text : "No text was selected.");

  const tree = await getTree();
  const options = flattenPickerOptions(tree);
  const target = document.getElementById("target") as HTMLSelectElement | null;
  if (!target) return;
  if (options.length === 0) {
    setStatus("Open your LockedIn dashboard once so it can load the task list.", true);
    const add = document.getElementById("add") as HTMLButtonElement | null;
    if (add) add.disabled = true;
    return;
  }
  for (const option of options) {
    const el = document.createElement("option");
    el.value = option.code;
    el.textContent = option.label;
    target.appendChild(el);
  }
  target.value = defaultCode(options);

  document.getElementById("add")?.addEventListener("click", () => {
    void addSnippet();
  });
}

void init();
