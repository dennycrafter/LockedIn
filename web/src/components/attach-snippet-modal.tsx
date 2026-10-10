"use client";

// Attach picker (SPEC 8.7): the selected text from a note becomes a dated
// snippet on a project, task or subtask. Project is required, task and
// subtask are optional below it; the most specific pick owns the snippet.
// Closes on success with the parent's toast, stays open on error.

import { useState } from "react";
import type { ProjectData } from "@/lib/dashboard-data";
import { Modal } from "./modal";

const SELECT_CLASS =
  "w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)]";

export interface SnippetAttach {
  ownerType: "project" | "task";
  ownerId: string;
  content: string;
  context: string;
}

export function AttachSnippetModal({
  projects,
  content,
  onAdded,
  onClose,
}: {
  projects: ProjectData[];
  content: string;
  onAdded: (attach: SnippetAttach) => void;
  onClose: () => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [subtaskId, setSubtaskId] = useState("");
  const [context, setContext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const project = projects.find((p) => p.id === projectId) ?? null;
  const task = project?.tasks.find((t) => t.id === taskId) ?? null;
  const subtask = task?.subtasks.find((s) => s.id === subtaskId) ?? null;

  // Most specific item wins (subtask > task > project, SPEC 8.7).
  const owner: { ownerType: "project" | "task"; ownerId: string } | null = subtask
    ? { ownerType: "task", ownerId: subtask.id }
    : task
      ? { ownerType: "task", ownerId: task.id }
      : project
        ? { ownerType: "project", ownerId: project.id }
        : null;

  const contentPreview = content.trim();

  const add = () => {
    if (!owner) {
      setError("Pick a project first.");
      return;
    }
    if (contentPreview === "") {
      setError("Select some text to attach.");
      return;
    }
    setSaving(true);
    setError(null);
    onAdded({ ownerType: owner.ownerType, ownerId: owner.ownerId, content: contentPreview, context });
  };

  return (
    <Modal title="Attach to task" onClose={onClose}>
      <p className="mb-3 max-h-24 overflow-y-auto rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs whitespace-pre-wrap text-[var(--silver)]">
        {contentPreview}
      </p>

      <div className="space-y-3">
        <label className="block text-xs text-[var(--muted)]">
          Project
          <select
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value);
              setTaskId("");
              setSubtaskId("");
              setError(null);
            }}
            className={`mt-1 ${SELECT_CLASS}`}
          >
            <option value="">Pick a project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs text-[var(--muted)]">
          Task (optional)
          <select
            value={taskId}
            onChange={(event) => {
              setTaskId(event.target.value);
              setSubtaskId("");
              setError(null);
            }}
            disabled={!project}
            className={`mt-1 ${SELECT_CLASS} disabled:opacity-40`}
          >
            <option value="">No specific task</option>
            {(project?.tasks ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs text-[var(--muted)]">
          Subtask (optional)
          <select
            value={subtaskId}
            onChange={(event) => {
              setSubtaskId(event.target.value);
              setError(null);
            }}
            disabled={!task}
            className={`mt-1 ${SELECT_CLASS} disabled:opacity-40`}
          >
            <option value="">No specific subtask</option>
            {(task?.subtasks ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs text-[var(--muted)]">
          Context (optional)
          <textarea
            value={context}
            onChange={(event) => setContext(event.target.value)}
            rows={2}
            placeholder="Why this matters, or where to use it"
            className={`mt-1 resize-y ${SELECT_CLASS} placeholder:text-[var(--muted)]`}
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs text-[var(--bad)]">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => add()}
          disabled={saving}
          className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: "var(--accent-strong)" }}
        >
          Add
        </button>
      </div>
    </Modal>
  );
}
