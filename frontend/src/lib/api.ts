import { User, Agent, Conversation, Message, Team, TeamMember } from '@/types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

class ApiClient {
  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('omnii_token');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Auth
  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async register(name: string, email: string, password: string): Promise<{ user: User; token: string }> {
    return this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
  }

  async getMe(): Promise<{ user: User }> {
    return this.request('/api/auth/me');
  }

  // Agents
  async getAgents(): Promise<{ agents: Agent[] }> {
    return this.request('/api/agents');
  }

  async getAgent(id: string): Promise<{ agent: Agent }> {
    return this.request(`/api/agents/${id}`);
  }

  async createAgent(data: {
    name: string;
    description?: string;
    system_prompt?: string;
    model?: string;
    team_id?: string;
  }): Promise<{ agent: Agent }> {
    return this.request('/api/agents', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateAgent(
    id: string,
    data: Partial<{ name: string; description: string; system_prompt: string; model: string; status: string }>
  ): Promise<{ agent: Agent }> {
    return this.request(`/api/agents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteAgent(id: string): Promise<void> {
    return this.request(`/api/agents/${id}`, { method: 'DELETE' });
  }

  // Conversations
  async getConversations(agentId: string): Promise<{ conversations: Conversation[] }> {
    return this.request(`/api/conversations?agentId=${agentId}`);
  }

  async getConversation(conversationId: string): Promise<{ conversation: Conversation; messages: Message[] }> {
    return this.request(`/api/conversations/${conversationId}`);
  }

  async createConversation(agentId: string, title?: string): Promise<{ conversation: Conversation }> {
    return this.request('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ agentId, title: title || 'New Conversation' }),
    });
  }

  async sendMessage(conversationId: string, content: string): Promise<{ message: Message; reply: Message }> {
    return this.request(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  async deleteConversation(conversationId: string): Promise<void> {
    return this.request(`/api/conversations/${conversationId}`, { method: 'DELETE' });
  }

  // Teams
  async getTeams(): Promise<{ teams: Team[] }> {
    return this.request('/api/teams');
  }

  async createTeam(name: string): Promise<{ team: Team }> {
    return this.request('/api/teams', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async getTeamMembers(teamId: string): Promise<{ members: TeamMember[] }> {
    return this.request(`/api/teams/${teamId}/members`);
  }

  async inviteTeamMember(teamId: string, email: string, role?: string): Promise<{ member: TeamMember }> {
    return this.request(`/api/teams/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify({ email, role: role || 'member' }),
    });
  }

  async removeTeamMember(teamId: string, memberId: string): Promise<void> {
    return this.request(`/api/teams/${teamId}/members/${memberId}`, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
