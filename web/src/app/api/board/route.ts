import { NextResponse, type NextRequest } from "next/server";
import { isAuthed } from "@/lib/require-user";
import { createServiceClient } from "@/lib/supabase";
import { parseBoardScene } from "@/lib/board";

export const dynamic = "force-dynamic";

// Board (Oct 2026): the ideas whiteboard is one row in `boards` (id 'main').
// GET returns it (or null before the first save); PUT replaces it.

const BOARD_ID = "main";

const MISSING_TABLE =
  "The board table is not in the database yet. Run supabase/migrations/0004_add_boards.sql in the Supabase SQL editor.";

// PostgREST says PGRST205 when the table is not in its schema cache; Postgres
// itself says 42P01. Either way the migration has not been run.
function isMissingTable(error: { code?: string; message?: string }): boolean {
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  const message = error.message ?? "";
  return /boards/.test(message) && /does not exist|schema cache/.test(message);
}

function dbError(error: { code?: string; message: string }) {
  if (isMissingTable(error)) {
    return NextResponse.json({ error: MISSING_TABLE, needsMigration: true }, { status: 503 });
  }
  return NextResponse.json({ error: error.message }, { status: 500 });
}

export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const client = createServiceClient();
  const { data, error } = await client.from("boards").select("scene, updated_at").eq("id", BOARD_ID).limit(1);
  if (error) return dbError(error);
  const row = data?.[0] as { scene: unknown; updated_at: string } | undefined;
  if (!row) return NextResponse.json({ board: null });
  const parsed = parseBoardScene(row.scene);
  // A row that no longer parses is treated as empty rather than breaking the tab.
  if ("error" in parsed) return NextResponse.json({ board: null });
  return NextResponse.json({ board: { scene: parsed.scene, savedAt: row.updated_at } });
}

export async function PUT(request: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const parsed = parseBoardScene((body as { scene?: unknown } | null)?.scene);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const savedAt = new Date().toISOString();
  const client = createServiceClient();
  const { error } = await client
    .from("boards")
    .upsert({ id: BOARD_ID, scene: parsed.scene, updated_at: savedAt }, { onConflict: "id" });
  if (error) return dbError(error);
  return NextResponse.json({ savedAt });
}
