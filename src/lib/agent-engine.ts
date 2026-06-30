import { v4 as uuidv4 } from "uuid";
import { queryAll, queryOne, execute } from "./database";
import type { Agent, AgentConfig, AgentLog, AgentMetrics } from "@/types";

interface AgentRow {
  id: string;
  name: string;
  description: string;
  type: string;
  status: string;
  config: string;
  metrics: string;
  created_at: string;
  updated_at: string;
  created_by: string;
}

function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as Agent["type"],
    status: row.status as Agent["status"],
    config: JSON.parse(row.config),
    metrics: JSON.parse(row.metrics),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

export function listAgents(): Agent[] {
  const rows = queryAll<AgentRow>("SELECT * FROM agents ORDER BY created_at DESC");
  return rows.map(rowToAgent);
}

export function getAgent(id: string): Agent | null {
  const row = queryOne<AgentRow>("SELECT * FROM agents WHERE id = ?", [id]);
  return row ? rowToAgent(row) : null;
}

export function createAgent(
  data: {
    name: string;
    description?: string;
    type?: Agent["type"];
    config?: AgentConfig;
  },
  createdBy: string
): Agent {
  const id = uuidv4();
  const now = new Date().toISOString();
  const defaultMetrics: AgentMetrics = {
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    averageLatencyMs: 0,
    lastRunAt: null,
    uptimePercent: 0,
  };

  execute(
    `INSERT INTO agents (id, name, description, type, status, config, metrics, created_at, updated_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.name,
      data.description || "",
      data.type || "custom",
      "offline",
      JSON.stringify(data.config || {}),
      JSON.stringify(defaultMetrics),
      now,
      now,
      createdBy,
    ]
  );

  return {
    id,
    name: data.name,
    description: data.description || "",
    type: data.type || "custom",
    status: "offline",
    config: data.config || {},
    metrics: defaultMetrics,
    createdAt: now,
    updatedAt: now,
    createdBy,
  };
}

export function updateAgent(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    type: Agent["type"];
    status: Agent["status"];
    config: AgentConfig;
  }>
): Agent | null {
  const existing = getAgent(id);
  if (!existing) return null;

  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.name !== undefined) {
    updates.push("name = ?");
    params.push(data.name);
  }
  if (data.description !== undefined) {
    updates.push("description = ?");
    params.push(data.description);
  }
  if (data.type !== undefined) {
    updates.push("type = ?");
    params.push(data.type);
  }
  if (data.status !== undefined) {
    updates.push("status = ?");
    params.push(data.status);
  }
  if (data.config !== undefined) {
    updates.push("config = ?");
    params.push(JSON.stringify(data.config));
  }

  if (updates.length === 0) return existing;

  updates.push("updated_at = ?");
  params.push(new Date().toISOString());
  params.push(id);

  execute(
    `UPDATE agents SET ${updates.join(", ")} WHERE id = ?`,
    params
  );

  return getAgent(id);
}

export function deleteAgent(id: string): boolean {
  const result = execute("DELETE FROM agents WHERE id = ?", [id]);
  return result.changes > 0;
}

export function updateAgentMetrics(
  id: string,
  metrics: Partial<AgentMetrics>
): void {
  const agent = getAgent(id);
  if (!agent) return;

  const updated = { ...agent.metrics, ...metrics };
  execute("UPDATE agents SET metrics = ?, updated_at = datetime('now') WHERE id = ?", [
    JSON.stringify(updated),
    id,
  ]);
}

export function addAgentLog(
  agentId: string,
  level: AgentLog["level"],
  message: string,
  metadata?: Record<string, unknown>
): void {
  execute(
    "INSERT INTO agent_logs (id, agent_id, level, message, metadata) VALUES (?, ?, ?, ?, ?)",
    [uuidv4(), agentId, level, message, metadata ? JSON.stringify(metadata) : null]
  );
}

export function getAgentLogs(
  agentId: string,
  limit = 100,
  offset = 0
): AgentLog[] {
  interface LogRow {
    id: string;
    agent_id: string;
    level: string;
    message: string;
    metadata: string | null;
    timestamp: string;
  }

  const rows = queryAll<LogRow>(
    "SELECT * FROM agent_logs WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?",
    [agentId, limit, offset]
  );

  return rows.map((row) => ({
    id: row.id,
    agentId: row.agent_id,
    level: row.level as AgentLog["level"],
    message: row.message,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    timestamp: row.timestamp,
  }));
}

export function getDashboardStats() {
  const agents = listAgents();
  const totalAgents = agents.length;
  const activeAgents = agents.filter((a) => a.status === "running").length;
  const errorAgents = agents.filter((a) => a.status === "error").length;

  const totalRuns = agents.reduce((sum, a) => sum + a.metrics.totalRuns, 0);
  const successfulRuns = agents.reduce(
    (sum, a) => sum + a.metrics.successfulRuns,
    0
  );

  return {
    totalAgents,
    activeAgents,
    errorAgents,
    totalRuns24h: totalRuns,
    successRate: totalRuns > 0 ? (successfulRuns / totalRuns) * 100 : 0,
    connectedClients: 0,
  };
}
