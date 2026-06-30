import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

interface AgentStatusUpdate {
  agentId: string;
  status: "idle" | "running" | "error" | "offline";
  message?: string;
  metrics?: Record<string, number>;
  timestamp: number;
}

interface LogEntry {
  agentId: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketIOServer(httpServer, {
    path: process.env.SOCKET_PATH || "/api/socketio",
    cors: {
      origin: dev ? "*" : false,
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
  });

  const connectedClients = new Map<string, { userId: string; role: string }>();

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication required"));
    }
    try {
      const jwt = require("jsonwebtoken");
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "omnii-dev-secret"
      ) as { userId: string; role: string };
      socket.data.userId = decoded.userId;
      socket.data.role = decoded.role;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const { userId, role } = socket.data;
    connectedClients.set(socket.id, { userId, role });

    console.log(`[Socket.IO] Client connected: ${userId} (${role})`);

    socket.join(`user:${userId}`);
    if (role === "admin") {
      socket.join("admins");
    }

    io.emit("clients:count", connectedClients.size);

    socket.on("agent:status", (update: AgentStatusUpdate) => {
      io.emit("agent:status", update);
    });

    socket.on("agent:log", (entry: LogEntry) => {
      io.to("admins").emit("agent:log", entry);
    });

    socket.on("agent:command", (data: { agentId: string; command: string; params?: Record<string, unknown> }) => {
      if (socket.data.role !== "admin") {
        socket.emit("error", { message: "Unauthorized" });
        return;
      }
      io.emit("agent:command", {
        ...data,
        issuedBy: userId,
        timestamp: Date.now(),
      });
    });

    socket.on("disconnect", () => {
      connectedClients.delete(socket.id);
      io.emit("clients:count", connectedClients.size);
      console.log(`[Socket.IO] Client disconnected: ${userId}`);
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`
  ╔══════════════════════════════════════════════╗
  ║        Omnii Command Centre v1.0.0           ║
  ║──────────────────────────────────────────────║
  ║  Server:  http://${hostname}:${port}              ║
  ║  Mode:    ${dev ? "development" : "production "}                    ║
  ║  Socket:  ${process.env.SOCKET_PATH || "/api/socketio"}                 ║
  ╚══════════════════════════════════════════════╝
    `);
  });
});
