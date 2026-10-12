// Dashboard entry (T1): server-loads today's data in Chicago time and hands it
// to the client shell that talks to the extension bridge. The EOD (T6b) and
// wind-down (T6a-1) openers sit inside the shell: Reports and the Wind down card.
import { LockedInApp } from "@/components/lockedin-app";
import { loadDashboardData, type DashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let data: DashboardData | null = null;
  let loadError: string | null = null;
  try {
    data = await loadDashboardData();
  } catch {
    loadError = "Could not reach the database. Check the Supabase project and try again.";
  }

  if (!data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-[1760px] flex-col px-[clamp(16px,2.6vw,40px)] py-8">
        <h1 className="text-lg font-semibold text-[var(--fg)]">LockedIn</h1>
        <p className="mt-4 text-sm text-[var(--bad)]">{loadError}</p>
      </main>
    );
  }

  return <LockedInApp initialData={data} />;
}
