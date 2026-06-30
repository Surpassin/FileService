"use client";

import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(token: string): Socket {
  if (socket?.connected) {
    return socket;
  }

  socket = io({
    path: "/api/socketio",
    auth: { token },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on("connect", () => {
    console.log("[Socket] Connected");
  });

  socket.on("disconnect", (reason) => {
    console.log("[Socket] Disconnected:", reason);
  });

  socket.on("connect_error", (error) => {
    console.error("[Socket] Connection error:", error.message);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function onAgentStatus(
  callback: (data: {
    agentId: string;
    status: string;
    message?: string;
    metrics?: Record<string, number>;
    timestamp: number;
  }) => void
): () => void {
  const s = getSocket();
  if (!s) return () => {};
  s.on("agent:status", callback);
  return () => s.off("agent:status", callback);
}

export function onAgentLog(
  callback: (data: {
    agentId: string;
    level: string;
    message: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
  }) => void
): () => void {
  const s = getSocket();
  if (!s) return () => {};
  s.on("agent:log", callback);
  return () => s.off("agent:log", callback);
}

export function onClientCount(
  callback: (count: number) => void
): () => void {
  const s = getSocket();
  if (!s) return () => {};
  s.on("clients:count", callback);
  return () => s.off("clients:count", callback);
}

export function sendAgentCommand(
  agentId: string,
  command: string,
  params?: Record<string, unknown>
) {
  const s = getSocket();
  if (!s) return;
  s.emit("agent:command", { agentId, command, params });
}
