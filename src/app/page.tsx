"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await apiClient.login({
        email,
        password,
        ...(isRegister && inviteCode ? { inviteCode } : {}),
      });

      if (result.success && result.data) {
        localStorage.setItem("omnii_user", JSON.stringify(result.data.user));
        router.push("/dashboard");
      } else {
        setError(result.error || "Authentication failed");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-0 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-omnii-600/20 rounded-2xl mb-4">
            <svg
              className="w-8 h-8 text-omnii-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Omnii Command Centre</h1>
          <p className="text-dark-5 mt-1">
            {isRegister ? "Create your account" : "Sign in to continue"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-surface-3 mb-1.5">
              Email
            </label>
            <input
              type="email"
              className="input-field"
              placeholder="admin@omnii.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-3 mb-1.5">
              Password
            </label>
            <input
              type="password"
              className="input-field"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {isRegister && (
            <div>
              <label className="block text-sm font-medium text-surface-3 mb-1.5">
                Invite Code
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="Enter invite code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                required
              />
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? "Authenticating..." : isRegister ? "Create Account" : "Sign In"}
          </button>

          <div className="text-center">
            <button
              type="button"
              className="text-sm text-omnii-500 hover:text-omnii-400"
              onClick={() => setIsRegister(!isRegister)}
            >
              {isRegister
                ? "Already have an account? Sign in"
                : "Have an invite code? Register"}
            </button>
          </div>
        </form>

        <p className="text-center text-xs text-dark-5 mt-6">
          Omnii Command Centre v1.0.0
        </p>
      </div>
    </div>
  );
}
