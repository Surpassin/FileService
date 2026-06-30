"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { apiClient } from "@/lib/api-client";
import type { InviteCode, User } from "@/types";

function InviteCodeRow({ code }: { code: InviteCode }) {
  const isExpired = new Date(code.expiresAt) < new Date();
  const isUsed = !!code.usedBy;

  return (
    <div className="flex items-center justify-between py-3 border-b border-dark-4 last:border-0">
      <div className="flex items-center gap-4">
        <code className="bg-dark-3 px-3 py-1 rounded text-sm font-mono text-omnii-400">
          {code.code}
        </code>
        <span className="badge-neutral">{code.role}</span>
      </div>
      <div className="flex items-center gap-3">
        {isUsed ? (
          <span className="badge-success">Used</span>
        ) : isExpired ? (
          <span className="badge-error">Expired</span>
        ) : (
          <span className="badge-info">Active</span>
        )}
        <span className="text-xs text-dark-5">
          Expires {new Date(code.expiresAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [newCodeRole, setNewCodeRole] = useState<string>("viewer");
  const [newCodeExpiry, setNewCodeExpiry] = useState(48);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("omnii_user");
      if (stored) setUser(JSON.parse(stored));
    }

    const result = await apiClient.getInviteCodes();
    if (result.success && result.data) setInviteCodes(result.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreateCode() {
    setCreating(true);
    const result = await apiClient.createInviteCode(newCodeRole, newCodeExpiry);
    if (result.success && result.data) {
      setInviteCodes((prev) => [result.data!, ...prev]);
    }
    setCreating(false);
  }

  function handleLogout() {
    apiClient.logout();
    window.location.href = "/";
  }

  return (
    <AppShell>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-dark-5 mt-1">Account and system configuration</p>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">Profile</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-dark-5">Email</span>
              <span className="text-surface-2">{user?.email || "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-dark-5">Name</span>
              <span className="text-surface-2">{user?.name || "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-dark-5">Role</span>
              <span className="badge-info">{user?.role || "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-dark-5">Member since</span>
              <span className="text-surface-2">
                {user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString()
                  : "—"}
              </span>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-dark-4">
            <button className="btn-danger" onClick={handleLogout}>
              Sign Out
            </button>
          </div>
        </div>

        {user?.role === "admin" && (
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">
              Invite Codes
            </h2>

            <div className="flex gap-3 mb-6">
              <select
                className="input-field w-40"
                value={newCodeRole}
                onChange={(e) => setNewCodeRole(e.target.value)}
              >
                <option value="viewer">Viewer</option>
                <option value="operator">Operator</option>
                <option value="admin">Admin</option>
              </select>
              <select
                className="input-field w-40"
                value={newCodeExpiry}
                onChange={(e) => setNewCodeExpiry(Number(e.target.value))}
              >
                <option value={24}>24 hours</option>
                <option value={48}>48 hours</option>
                <option value={168}>7 days</option>
                <option value={720}>30 days</option>
              </select>
              <button
                className="btn-primary"
                onClick={handleCreateCode}
                disabled={creating}
              >
                {creating ? "Creating..." : "Generate Code"}
              </button>
            </div>

            {loading ? (
              <p className="text-dark-5 text-sm">Loading...</p>
            ) : inviteCodes.length === 0 ? (
              <p className="text-dark-5 text-sm">No invite codes generated yet.</p>
            ) : (
              <div>{inviteCodes.map((code) => (
                <InviteCodeRow key={code.id} code={code} />
              ))}</div>
            )}
          </div>
        )}

        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">About</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-dark-5">Version</span>
              <span className="text-surface-2">1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dark-5">Runtime</span>
              <span className="text-surface-2">Next.js + Socket.IO</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dark-5">Database</span>
              <span className="text-surface-2">SQLite (better-sqlite3)</span>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
