import { NextResponse, type NextRequest } from "next/server";
import { isAuthed } from "@/lib/require-user";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const name =
    typeof (body as { name?: unknown }).name === "string"
      ? ((body as { name: string }).name.trim().slice(0, 120) as string)
      : "";
  if (!name) {
    return NextResponse.json({ error: "Project name is required." }, { status: 400 });
  }

  const client = createServiceClient();
  const { data: last } = await client
    .from("projects")
    .select("position")
    .order("position", { ascending: false })
    .limit(1);
  const position = last && last.length > 0 ? last[0].position + 1 : 0;

  const { data, error } = await client
    .from("projects")
    .insert({ name, position })
    .select("id, name, position");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ project: data[0] }, { status: 201 });
}
