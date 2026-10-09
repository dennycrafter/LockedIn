import { NextResponse } from "next/server";
import { loadDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

// The client refreshes this after every sync cycle and after each mutation, so
// the stats strip and lists track the database without a full page reload.
export async function GET() {
  try {
    const data = await loadDashboardData();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load dashboard data." },
      { status: 500 },
    );
  }
}
