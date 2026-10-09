// T0 dashboard placeholder. The stats strip, projects and session panel land
// in tickets T1 to T3.
export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[1760px] flex-col px-4 py-8 sm:px-8">
      <header className="flex items-center justify-between gap-4">
        <span className="text-lg font-semibold text-[var(--fg)]">LockedIn</span>
        <form action="/api/logout" method="post">
          <button
            type="submit"
            aria-label="Lock the dashboard and clear the session"
            className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)] transition-colors hover:border-[var(--muted)] hover:text-[var(--fg)]"
          >
            Lock
          </button>
        </form>
      </header>
      <div className="flex flex-1 items-center justify-center">
        <p className="text-[var(--muted)]">Welcome back. Panels arrive in the next tickets.</p>
      </div>
    </main>
  );
}
