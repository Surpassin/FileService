"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { apiClient } from "@/lib/api-client";
import { onAgentStatus, onClientCount } from "@/lib/socket-client";
import type { DashboardStats, Agent } from "@/types";

function StatCard({
  label,
  value,
  color = "text-white",
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="stat-card">
      <span className={`stat-value ${color}`}>{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function AgentStatusRow({ agent }: { agent: Agent }) {
  const statusStyles: Record<string, string> = {
    running: "badge-success",
    idle: "badge-info",
    error: "badge-error",
    offline: "badge-neutral",
  };

  return (
    <div className="flex items-center justify-between py-3 border-b border-dark-4 last:border-0">
      <div className="flex items-center gap-3">
        <div
          className={`w-2 h-2 rounded-full ${
            agent.status === "running"
              ? "bg-green-400 animate-pulse"
              : agent.status === "error"
              ? "bg-red-400"
              : agent.status === "idle"
              ? "bg-blue-400"
              : "bg-gray-500"
          }`}
        />
        <div>
          <p className="text-sm font-medium text-white">{agent.name}</p>
          <p className="text-xs text-dark-5">{agent.type}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-dark-5">
          {agent.metrics.totalRuns} runs
        </span>
        <span className={statusStyles[agent.status] || "badge-neutral"}>
          {agent.status}
        </span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [connectedClients, setConnectedClients] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [statsRes, agentsRes] = await Promise.all([
      apiClient.getDashboardStats(),
      apiClient.getAgents(),
    ]);
    if (statsRes.success && statsRes.data) setStats(statsRes.data);
    if (agentsRes.success && agentsRes.data) setAgents(agentsRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();

    const unsubStatus = onAgentStatus(() => {
      loadData();
    });

    const unsubClients = onClientCount((count) => {
      setConnectedClients(count);
    });

    return () => {
      unsubStatus();
      unsubClients();
    };
  }, [loadData]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-full">
          <div className="text-dark-5">Loading dashboard...</div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-dark-5 mt-1">System overview and agent status</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Agents"
            value={stats?.totalAgents ?? 0}
          />
          <StatCard
            label="Active"
            value={stats?.activeAgents ?? 0}
            color="text-green-400"
          />
          <StatCard
            label="Errors"
            value={stats?.errorAgents ?? 0}
            color="text-red-400"
          />
          <StatCard
            label="Connected Clients"
            value={connectedClients}
            color="text-omnii-400"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                Success Rate
              </h2>
              <span className="text-2xl font-bold text-green-400">
                {(stats?.successRate ?? 0).toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-dark-3 rounded-full h-3">
              <div
                className="bg-green-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${stats?.successRate ?? 0}%` }}
              />
            </div>
            <p className="text-xs text-dark-5 mt-2">
              {stats?.totalRuns24h ?? 0} total runs in the last 24 hours
            </p>
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">
              Agent Status
            </h2>
            {agents.length === 0 ? (
              <p className="text-dark-5 text-sm">
                No agents configured. Create one from the Agents page.
              </p>
            ) : (
              <div className="divide-y divide-dark-4">
                {agents.slice(0, 5).map((agent) => (
                  <AgentStatusRow key={agent.id} agent={agent} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
