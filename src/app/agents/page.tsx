"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { apiClient } from "@/lib/api-client";
import { sendAgentCommand } from "@/lib/socket-client";
import type { Agent, AgentConfig } from "@/types";

const AGENT_TYPES: Agent["type"][] = [
  "classifier",
  "executor",
  "monitor",
  "orchestrator",
  "custom",
];

function CreateAgentModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (agent: Agent) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<Agent["type"]>("custom");
  const [model, setModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!name.trim()) {
      setError("Agent name is required");
      return;
    }
    setLoading(true);
    setError("");

    const config: AgentConfig = {};
    if (model) config.model = model;
    if (systemPrompt) config.systemPrompt = systemPrompt;

    const result = await apiClient.createAgent({
      name,
      description,
      type,
      config,
    });

    if (result.success && result.data) {
      onCreate(result.data);
      onClose();
    } else {
      setError(result.error || "Failed to create agent");
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg space-y-4">
        <h2 className="text-xl font-bold text-white">Create Agent</h2>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-surface-3 mb-1.5">
            Name
          </label>
          <input
            className="input-field"
            placeholder="My Agent"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-3 mb-1.5">
            Description
          </label>
          <textarea
            className="input-field min-h-[80px] resize-y"
            placeholder="What does this agent do?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-3 mb-1.5">
            Type
          </label>
          <select
            className="input-field"
            value={type}
            onChange={(e) => setType(e.target.value as Agent["type"])}
          >
            {AGENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-3 mb-1.5">
            Model (optional)
          </label>
          <input
            className="input-field"
            placeholder="e.g. claude-sonnet-4-6"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-3 mb-1.5">
            System Prompt (optional)
          </label>
          <textarea
            className="input-field min-h-[80px] resize-y"
            placeholder="Instructions for the agent..."
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleCreate} disabled={loading}>
            {loading ? "Creating..." : "Create Agent"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AgentCard({
  agent,
  onUpdate,
  onDelete,
}: {
  agent: Agent;
  onUpdate: (agent: Agent) => void;
  onDelete: (id: string) => void;
}) {
  const [showActions, setShowActions] = useState(false);

  const statusColor: Record<string, string> = {
    running: "bg-green-400",
    idle: "bg-blue-400",
    error: "bg-red-400",
    offline: "bg-gray-500",
  };

  const statusBadge: Record<string, string> = {
    running: "badge-success",
    idle: "badge-info",
    error: "badge-error",
    offline: "badge-neutral",
  };

  async function handleToggle() {
    const newStatus = agent.status === "running" ? "idle" : "running";
    const result = await apiClient.updateAgent(agent.id, { status: newStatus });
    if (result.success && result.data) {
      onUpdate(result.data);
      sendAgentCommand(agent.id, newStatus === "running" ? "start" : "stop");
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete agent "${agent.name}"?`)) return;
    const result = await apiClient.deleteAgent(agent.id);
    if (result.success) onDelete(agent.id);
  }

  return (
    <div className="card hover:border-dark-5 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${statusColor[agent.status]} ${agent.status === "running" ? "animate-pulse" : ""}`} />
          <div>
            <h3 className="font-semibold text-white">{agent.name}</h3>
            <p className="text-sm text-dark-5">{agent.description || "No description"}</p>
          </div>
        </div>
        <div className="relative">
          <button
            className="text-dark-5 hover:text-white p-1"
            onClick={() => setShowActions(!showActions)}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>
          {showActions && (
            <div className="absolute right-0 mt-1 w-36 bg-dark-3 border border-dark-4 rounded-lg shadow-xl z-10">
              <button
                className="w-full text-left px-4 py-2 text-sm text-surface-2 hover:bg-dark-4 rounded-t-lg"
                onClick={() => { handleToggle(); setShowActions(false); }}
              >
                {agent.status === "running" ? "Stop" : "Start"}
              </button>
              <button
                className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-dark-4 rounded-b-lg"
                onClick={() => { handleDelete(); setShowActions(false); }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <span className={statusBadge[agent.status]}>{agent.status}</span>
        <span className="badge-neutral">{agent.type}</span>
        {agent.config.model && (
          <span className="badge-info">{agent.config.model}</span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-lg font-semibold text-white">{agent.metrics.totalRuns}</p>
          <p className="text-xs text-dark-5">Total Runs</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-green-400">{agent.metrics.successfulRuns}</p>
          <p className="text-xs text-dark-5">Successful</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-red-400">{agent.metrics.failedRuns}</p>
          <p className="text-xs text-dark-5">Failed</p>
        </div>
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const loadAgents = useCallback(async () => {
    const result = await apiClient.getAgents();
    if (result.success && result.data) setAgents(result.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const filteredAgents = filter === "all"
    ? agents
    : agents.filter((a) => a.status === filter);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Agents</h1>
            <p className="text-dark-5 mt-1">Manage and monitor your AI agents</p>
          </div>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            + Create Agent
          </button>
        </div>

        <div className="flex gap-2">
          {["all", "running", "idle", "error", "offline"].map((s) => (
            <button
              key={s}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === s
                  ? "bg-omnii-600 text-white"
                  : "bg-dark-3 text-dark-5 hover:text-surface-2"
              }`}
              onClick={() => setFilter(s)}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
              {s !== "all" && (
                <span className="ml-1.5 text-xs">
                  ({agents.filter((a) => a.status === s).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-dark-5 text-center py-12">Loading agents...</div>
        ) : filteredAgents.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-dark-5">
              {filter === "all"
                ? "No agents yet. Create your first agent to get started."
                : `No ${filter} agents.`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onUpdate={(updated) =>
                  setAgents((prev) =>
                    prev.map((a) => (a.id === updated.id ? updated : a))
                  )
                }
                onDelete={(id) =>
                  setAgents((prev) => prev.filter((a) => a.id !== id))
                }
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateAgentModal
          onClose={() => setShowCreate(false)}
          onCreate={(agent) => setAgents((prev) => [agent, ...prev])}
        />
      )}
    </AppShell>
  );
}
