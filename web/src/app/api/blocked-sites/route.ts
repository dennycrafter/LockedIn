import { NextResponse, type NextRequest } from "next/server";
import { SOCIAL_MEDIA_PACK } from "@/lib/blocked-sites";
import { normalizeHostname } from "@/lib/hostname";
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
  const raw = body as { inputs?: unknown; socialPack?: unknown };

  const inputs: string[] = [];
  if (Array.isArray(raw.inputs)) {
    for (const item of raw.inputs) {
      if (typeof item === "string" && item.trim().length > 0) inputs.push(item);
    }
  }
  if (raw.socialPack === true) inputs.push(...SOCIAL_MEDIA_PACK);
  if (inputs.length === 0) {
    return NextResponse.json({ error: "Nothing to add." }, { status: 400 });
  }

  // Store only clean hostnames: lowercase, no www., deduped (SPEC 8.5).
  const domains = [...new Set(inputs.map((i) => normalizeHostname(i)).filter((d) => d !== null))].sort();
  if (domains.length === 0) {
    return NextResponse.json({ error: "No valid hostnames in the input." }, { status: 400 });
  }

  const client = createServiceClient();
  const { error } = await client
    .from("blocked_sites")
    .upsert(domains.map((domain) => ({ domain })), { onConflict: "domain", ignoreDuplicates: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: sites, error: listError } = await client
    .from("blocked_sites")
    .select("id, domain")
    .order("domain");
  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }
  return NextResponse.json({ sites }, { status: 201 });
}
