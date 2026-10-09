// One query bundle for the whole dashboard (server side only): projects with
// their tasks, the blocked-site list, and today's sessions and infractions.
// "Today" opens at midnight America/Chicago (SPEC 8.16, SPEC 12).
import { createServiceClient } from "@/lib/supabase";
import { chicagoTodayStart } from "@/lib/time";

export interface TaskData {
  id: string;
  title: string;
  done: boolean;
  position: number;
}

export interface ProjectData {
  id: string;
  name: string;
  position: number;
  tasks: TaskData[];
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
  projects: ProjectData[];
  blockedSites: BlockedSiteData[];
  todaySessions: SessionData[];
  todayInfractions: InfractionData[];
}

export async function loadDashboardData(): Promise<DashboardData> {
  const client = createServiceClient();
  const dayStart = chicagoTodayStart().toISOString();

  const [projectsRes, tasksRes, sitesRes, sessionsRes, infractionsRes] = await Promise.all([
    client.from("projects").select("id, name, position").order("position"),
    client.from("tasks").select("id, project_id, title, done, position").order("position"),
    client.from("blocked_sites").select("id, domain").order("domain"),
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
  for (const res of [projectsRes, tasksRes, sitesRes, sessionsRes, infractionsRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const projectRows = projectsRes.data ?? [];
  const taskRows = tasksRes.data ?? [];
  const siteRows = sitesRes.data ?? [];
  const sessionRows = sessionsRes.data ?? [];
  const infractionRows = infractionsRes.data ?? [];

  const tasksByProject = new Map<string, TaskData[]>();
  for (const task of taskRows) {
    const list = tasksByProject.get(task.project_id) ?? [];
    list.push({ id: task.id, title: task.title, done: task.done, position: task.position });
    tasksByProject.set(task.project_id, list);
  }

  return {
    projects: projectRows.map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      tasks: tasksByProject.get(p.id) ?? [],
    })),
    blockedSites: siteRows.map((s) => ({ id: s.id, domain: s.domain })),
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
