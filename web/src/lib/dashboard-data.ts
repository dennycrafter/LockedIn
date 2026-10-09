// One query bundle for the whole dashboard (server side only): settings,
// projects with their nested tasks and subtasks, links and dated snippets per
// item, the blocked-site list, and today's sessions and infractions.
// "Today" opens at midnight America/Chicago (SPEC 8.16, SPEC 12).

import { createServiceClient } from "@/lib/supabase";
import { chicagoTodayStart } from "@/lib/time";

export type CelebrationStyle = "dramatic" | "hype" | "calm";

export interface SettingsData {
  display_name: string;
  completion_style: CelebrationStyle;
}

export interface LinkData {
  id: string;
  name: string;
  url: string;
}

export interface SnippetData {
  id: string;
  content: string;
  context: string;
  created_at: string;
}

export interface TaskData {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  title: string;
  done: boolean;
  notes: string;
  position: number;
  links: LinkData[];
  snippets: SnippetData[];
  subtasks: TaskData[];
}

export interface ProjectData {
  id: string;
  name: string;
  notes: string;
  position: number;
  links: LinkData[];
  snippets: SnippetData[];
  tasks: TaskData[];
}

export interface MiscTaskData {
  id: string;
  title: string;
  done: boolean;
  position: number;
}

export interface OpenLoopData {
  id: string;
  kind: "loop" | "decision";
  text: string;
  created_at: string;
}

export interface BlockedSiteData {
  id: string;
  domain: string;
}

export interface SessionData {
  id: string;
  project_id: string | null;
  task_id: string | null;
  active_seconds: number;
  started_at: string;
  ended_at: string;
}

export interface InfractionData {
  id: string;
  kind: "site" | "manual";
  detail: string;
  occurred_at: string;
}

export interface DashboardData {
  settings: SettingsData;
  projects: ProjectData[];
  blockedSites: BlockedSiteData[];
  openLoops: OpenLoopData[];
  miscTasks: MiscTaskData[];
  todaySessions: SessionData[];
  todayInfractions: InfractionData[];
}

/** Defaults for a database where the settings row has not been inserted yet. */
export const DEFAULT_SETTINGS: SettingsData = { display_name: "Boss", completion_style: "dramatic" };

interface LinkRow {
  id: string;
  owner_type: string;
  owner_id: string;
  name: string;
  url: string;
}

interface SnippetRow {
  id: string;
  owner_type: string;
  owner_id: string;
  content: string;
  context: string;
  created_at: string;
}

interface OpenLoopRow {
  id: string;
  kind: string;
  text: string;
  created_at: string;
}

interface MiscTaskRow {
  id: string;
  title: string;
  done: boolean;
  position: number;
}

interface TaskRow {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  title: string;
  done: boolean;
  notes: string;
  position: number;
}

/** Group link or snippet rows by owner key ("project:<id>" / "task:<id>"). */
function distribute<T extends { owner_type: string; owner_id: string }, B>(
  rows: T[],
  build: (row: T) => B,
): Map<string, B[]> {
  const byOwner = new Map<string, B[]>();
  for (const row of rows) {
    const key = `${row.owner_type}:${row.owner_id}`;
    const list = byOwner.get(key) ?? [];
    list.push(build(row));
    byOwner.set(key, list);
  }
  return byOwner;
}

export async function loadDashboardData(): Promise<DashboardData> {
  const client = createServiceClient();
  const dayStart = chicagoTodayStart().toISOString();

  const [settingsRes, projectsRes, tasksRes, linksRes, snippetsRes, sitesRes, loopsRes, miscRes, sessionsRes, infractionsRes] =
    await Promise.all([
      client.from("settings").select("display_name, completion_style").eq("id", 1).limit(1),
      client.from("projects").select("id, name, notes, position").order("position"),
      client
        .from("tasks")
        .select("id, project_id, parent_task_id, title, done, notes, position")
        .order("position"),
      client.from("links").select("id, owner_type, owner_id, name, url").order("created_at"),
      client
        .from("note_snippets")
        .select("id, owner_type, owner_id, content, context, created_at")
        .order("created_at", { ascending: false }),
      client.from("blocked_sites").select("id, domain").order("domain"),
      // Newest first so the thing just parked sits at the top of its list.
      client.from("open_loops").select("id, kind, text, created_at").order("created_at", { ascending: false }),
      client.from("misc_tasks").select("id, title, done, position").order("position"),
      client
        .from("sessions")
        .select("id, project_id, task_id, active_seconds, started_at, ended_at")
        .gte("started_at", dayStart)
        .order("started_at"),
      client
        .from("infractions")
        .select("id, kind, detail, occurred_at")
        .gte("occurred_at", dayStart)
        .order("occurred_at"),
    ]);

  // A first-run database with no rows must render an empty dashboard, not an
  // error; individual query failures still surface.
  for (const res of [settingsRes, projectsRes, tasksRes, linksRes, snippetsRes, sitesRes, loopsRes, miscRes, sessionsRes, infractionsRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const projectRows = projectsRes.data ?? [];
  const taskRows = (tasksRes.data ?? []) as TaskRow[];
  const linkRows = (linksRes.data ?? []) as LinkRow[];
  const snippetRows = (snippetsRes.data ?? []) as SnippetRow[];
  const siteRows = sitesRes.data ?? [];
  const loopRows = (loopsRes.data ?? []) as OpenLoopRow[];
  const miscRows = (miscRes.data ?? []) as MiscTaskRow[];
  const sessionRows = sessionsRes.data ?? [];
  const infractionRows = infractionsRes.data ?? [];

  const settingsRow = settingsRes.data?.[0];
  const settings: SettingsData = settingsRow
    ? {
        display_name: settingsRow.display_name,
        completion_style: settingsRow.completion_style as CelebrationStyle,
      }
    : DEFAULT_SETTINGS;

  const linksByOwner = distribute(linkRows, (row) => ({ id: row.id, name: row.name, url: row.url }));
  // note_snippets arrive newest first (created_at desc); keep that order.
  const snippetsByOwner = distribute(snippetRows, (row) => ({
    id: row.id,
    content: row.content,
    context: row.context,
    created_at: row.created_at,
  }));

  function linksFor(ownerType: "project" | "task", ownerId: string): LinkData[] {
    return linksByOwner.get(`${ownerType}:${ownerId}`) ?? [];
  }
  function snippetsFor(ownerType: "project" | "task", ownerId: string): SnippetData[] {
    return snippetsByOwner.get(`${ownerType}:${ownerId}`) ?? [];
  }

  // Subtasks first (they hang off a parent), then top-level tasks; both lists
  // keep the query's position order.
  const subtasksByParent = new Map<string, TaskData[]>();
  for (const row of taskRows) {
    if (row.parent_task_id === null) continue;
    const list = subtasksByParent.get(row.parent_task_id) ?? [];
    list.push({
      id: row.id,
      project_id: row.project_id,
      parent_task_id: row.parent_task_id,
      title: row.title,
      done: row.done,
      notes: row.notes,
      position: row.position,
      links: linksFor("task", row.id),
      snippets: snippetsFor("task", row.id),
      subtasks: [],
    });
    subtasksByParent.set(row.parent_task_id, list);
  }

  const topTasksByProject = new Map<string, TaskData[]>();
  for (const row of taskRows) {
    if (row.parent_task_id !== null) continue;
    const list = topTasksByProject.get(row.project_id) ?? [];
    list.push({
      id: row.id,
      project_id: row.project_id,
      parent_task_id: null,
      title: row.title,
      done: row.done,
      notes: row.notes,
      position: row.position,
      links: linksFor("task", row.id),
      snippets: snippetsFor("task", row.id),
      subtasks: subtasksByParent.get(row.id) ?? [],
    });
    topTasksByProject.set(row.project_id, list);
  }

  return {
    settings,
    projects: projectRows.map((p) => ({
      id: p.id,
      name: p.name,
      notes: p.notes,
      position: p.position,
      links: linksFor("project", p.id),
      snippets: snippetsFor("project", p.id),
      tasks: topTasksByProject.get(p.id) ?? [],
    })),
    blockedSites: siteRows.map((s) => ({ id: s.id, domain: s.domain })),
    openLoops: loopRows.map((l) => ({
      id: l.id,
      kind: l.kind as OpenLoopData["kind"],
      text: l.text,
      created_at: l.created_at,
    })),
    miscTasks: miscRows.map((m) => ({
      id: m.id,
      title: m.title,
      done: m.done,
      position: m.position,
    })),
    todaySessions: sessionRows.map((s) => ({
      id: s.id,
      project_id: s.project_id,
      task_id: s.task_id,
      active_seconds: s.active_seconds,
      started_at: s.started_at,
      ended_at: s.ended_at,
    })),
    todayInfractions: infractionRows.map((f) => ({
      id: f.id,
      kind: f.kind as InfractionData["kind"],
      detail: f.detail,
      occurred_at: f.occurred_at,
    })),
  };
}
