import type {
  ApiResponse,
  Agent,
  LoginRequest,
  LoginResponse,
  DashboardStats,
  InviteCode,
} from "@/types";

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl = "") {
    this.baseUrl = baseUrl;
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("omnii_token");
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== "undefined") {
      if (token) {
        localStorage.setItem("omnii_token", token);
      } else {
        localStorage.removeItem("omnii_token");
      }
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || "Request failed" };
    }

    return data;
  }

  async login(credentials: LoginRequest): Promise<ApiResponse<LoginResponse>> {
    const result = await this.request<LoginResponse>("/api/auth", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    if (result.success && result.data) {
      this.setToken(result.data.token);
    }
    return result;
  }

  logout() {
    this.setToken(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("omnii_user");
    }
  }

  async getAgents(): Promise<ApiResponse<Agent[]>> {
    return this.request<Agent[]>("/api/agents");
  }

  async getAgent(id: string): Promise<ApiResponse<Agent>> {
    return this.request<Agent>(`/api/agents?id=${id}`);
  }

  async createAgent(
    data: Partial<Agent>
  ): Promise<ApiResponse<Agent>> {
    return this.request<Agent>("/api/agents", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateAgent(
    id: string,
    data: Partial<Agent>
  ): Promise<ApiResponse<Agent>> {
    return this.request<Agent>("/api/agents", {
      method: "PUT",
      body: JSON.stringify({ id, ...data }),
    });
  }

  async deleteAgent(id: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/agents?id=${id}`, {
      method: "DELETE",
    });
  }

  async getDashboardStats(): Promise<ApiResponse<DashboardStats>> {
    return this.request<DashboardStats>("/api/agents?stats=true");
  }

  async getInviteCodes(): Promise<ApiResponse<InviteCode[]>> {
    return this.request<InviteCode[]>("/api/invite-codes");
  }

  async createInviteCode(
    role: string,
    expiresInHours?: number
  ): Promise<ApiResponse<InviteCode>> {
    return this.request<InviteCode>("/api/invite-codes", {
      method: "POST",
      body: JSON.stringify({ role, expiresInHours }),
    });
  }
}

export const apiClient = new ApiClient();
export default apiClient;
