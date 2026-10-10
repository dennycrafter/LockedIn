"use client";

import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.href = "/";
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Something went wrong. Try again.");
      setPending(false);
    } catch {
      setError("Could not reach the server. Try again.");
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        aria-label="Unlock LockedIn"
        className="w-full max-w-[320px] rounded-lg border border-[var(--line)] bg-[var(--surface)] p-6"
      >
        <h1 className="text-lg font-semibold text-[var(--fg)]">LockedIn</h1>
        <p className="mb-5 mt-1 text-sm text-[var(--muted)]">Enter your dashboard password.</p>
        <label htmlFor="password" className="mb-1 block text-sm text-[var(--fg)]">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-[var(--fg)] outline-none focus:border-[var(--accent-ink)]"
        />
        {error && (
          <p role="alert" className="mb-4 text-sm text-[var(--bad)]">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-[var(--accent-strong)] px-3 py-2 font-medium text-white transition-colors hover:bg-[var(--accent-strong-hover)] disabled:opacity-60"
        >
          {pending ? "Checking..." : "Unlock"}
        </button>
      </form>
    </main>
  );
}
