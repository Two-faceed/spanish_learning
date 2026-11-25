"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronsRight, Lock } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Network error while logging in.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-6 rounded-[28px] bg-[#181A1F] border border-white/[0.07] p-6 shadow-2xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-[#FF4F17] text-black flex items-center justify-center font-extrabold shadow-[0_8px_20px_rgba(255,79,23,0.35)]">
          <Lock className="w-5 h-5" />
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF4F17]">
            PRIVATE ACCESS
          </div>
          <h1 className="font-display font-extrabold text-xl text-white">
            Single-Learner Login
          </h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">
            Email (optional for local passcode mode)
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="learner@example.com"
            className="w-full rounded-2xl bg-[#101216] border border-white/10 text-white px-4 py-3 text-sm focus:outline-none focus:border-[#FF4F17]"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">
            Passcode
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password (default: madrid-b1)"
            className="w-full rounded-2xl bg-[#101216] border border-white/10 text-white px-4 py-3 text-sm focus:outline-none focus:border-[#FF4F17]"
          />
        </div>

        {error && (
          <div className="text-xs text-rose-300 bg-rose-500/15 border border-rose-500/35 rounded-2xl p-3">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-[#FF4F17] hover:bg-[#FF6230] text-black font-extrabold text-sm py-2 pl-6 pr-2 flex items-center justify-between shadow-[0_10px_30px_rgba(255,79,23,0.35)] transition"
        >
          <span>{submitting ? "Signing in..." : "Get Started"}</span>
          <span className="w-10 h-10 rounded-full bg-[#0D0E11] text-[#FF4F17] flex items-center justify-center">
            <ChevronsRight className="w-5 h-5" />
          </span>
        </button>
      </form>
    </div>
  );
}
