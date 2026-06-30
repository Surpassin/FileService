export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "operator" | "viewer";
  createdAt: string;
  lastLoginAt: string | null;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  type: "classifier" | "executor" | "monitor" | "orchestrator" | "custom";
  status: "idle" | "running" | "error" | "offline";
  config: AgentConfig;
  metrics: AgentMetrics;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface AgentConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  tools?: string[];
  schedule?: string;
  webhookUrl?: string;
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
  };
  env?: Record<string, string>;
}

export interface AgentMetrics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  averageLatencyMs: number;
  lastRunAt: string | null;
  uptimePercent: number;
}

export interface AgentLog {
  id: string;
  agentId: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface InviteCode {
  id: string;
  code: string;
  role: "admin" | "operator" | "viewer";
  createdBy: string;
  usedBy: string | null;
  usedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface DashboardStats {
  totalAgents: number;
  activeAgents: number;
  errorAgents: number;
  totalRuns24h: number;
  successRate: number;
  connectedClients: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AuthPayload {
  userId: string;
  email: string;
  role: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  inviteCode?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}
