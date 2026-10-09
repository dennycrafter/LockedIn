import { NextResponse, type NextRequest } from "next/server";
import { parseSyncPayload } from "@/lib/sync-parse";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Saves what the extension drained (SPEC 8.17): sessions and infractions
// upserted on their extension-generated uuid with duplicates ignored, so a
// replay of the same batch is a no-op and ack only happens after a 200 here.
// The saved counts are batch sizes: every row is stored-or-already-there after
// a 200, which is the guarantee the ack needs.
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const payload = parseSyncPayload(body);
  if (!payload) {
    return NextResponse.json({ error: "Malformed sync payload." }, { status: 400 });
  }

  const client = createServiceClient();
  const saved = {
    sessions: payload.sessions.length,
    infractions: payload.infractions.length,
    snippets: payload.snippets.length,
    time_studies: payload.time_studies.length,
  };

  if (payload.sessions.length > 0) {
    const { error } = await client
      .from("sessions")
      .upsert(payload.sessions, { onConflict: "id", ignoreDuplicates: true });
    if (error) {
      // A task or project can be deleted while a session runs; the FK would
      // fail the whole batch. Drop the reference and retry the same rows once
      // so the focused time is still saved against no item.
      const detached = payload.sessions.map((s) => ({
        ...s,
        project_id: null,
        task_id: null,
        misc_task_id: null,
      }));
      const retry = await client.from("sessions").upsert(detached, { onConflict: "id", ignoreDuplicates: true });
      if (retry.error) {
        return NextResponse.json({ error: retry.error.message }, { status: 500 });
      }
    }
  }

  if (payload.infractions.length > 0) {
    const { error } = await client
      .from("infractions")
      .upsert(payload.infractions, { onConflict: "id", ignoreDuplicates: true });
    if (error) {
      // Same FK story: an infraction may point at a session that no longer
      // maps; save it detached rather than losing the count.
      const detached = payload.infractions.map((f) => ({ ...f, session_id: null }));
      const retry = await client.from("infractions").upsert(detached, { onConflict: "id", ignoreDuplicates: true });
      if (retry.error) {
        return NextResponse.json({ error: retry.error.message }, { status: 500 });
      }
    }
  }

  if (payload.snippets.length > 0) {
    const { error } = await client
      .from("note_snippets")
      .upsert(payload.snippets, { onConflict: "id", ignoreDuplicates: true });
    if (error) {
      // The extension generates the ids and may replay a batch; a replay hits
      // the duplicate-ignore path, so reaching here is a real failure and the
      // queue stays for the next cycle.
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (payload.time_studies.length > 0) {
    const { error } = await client
      .from("time_studies")
      .upsert(payload.time_studies, { onConflict: "id", ignoreDuplicates: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, saved });
}
