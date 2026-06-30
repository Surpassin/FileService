export interface User {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: string;
  created_at: Date;
  last_login_at: Date | null;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  model: string;
  config: string;
  status: string;
  owner_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface Conversation {
  id: string;
  agent_id: string;
  user_id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: Date;
}

export interface AuditLogEntry {
  id: string;
  user_id: string;
  action: string;
  details: string | null;
  created_at: Date;
}

export interface CreateAgentRequest {
  name: string;
  description: string;
  system_prompt: string;
  model?: string;
  config?: Record<string, unknown>;
}

export interface UpdateAgentRequest {
  name?: string;
  description?: string;
  system_prompt?: string;
  model?: string;
  config?: Record<string, unknown>;
  status?: string;
}

export interface SendMessageRequest {
  content: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  name: string;
  password: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
