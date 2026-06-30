import { NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import {
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  getDashboardStats,
} from "@/lib/agent-engine";

export async function GET(request: Request) {
  const auth = requireAuth(request);
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(request.url);

  if (searchParams.get("stats") === "true") {
    const stats = getDashboardStats();
    return NextResponse.json({ success: true, data: stats });
  }

  const id = searchParams.get("id");
  if (id) {
    const agent = getAgent(id);
    if (!agent) {
      return NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: agent });
  }

  const agents = listAgents();
  return NextResponse.json({ success: true, data: agents });
}

export async function POST(request: Request) {
  const auth = requireRole(request, "admin", "operator");
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const { name, description, type, config } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Agent name is required" },
        { status: 400 }
      );
    }

    const agent = createAgent(
      { name, description, type, config },
      auth.userId
    );

    return NextResponse.json({ success: true, data: agent }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create agent";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const auth = requireRole(request, "admin", "operator");
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Agent ID is required" },
        { status: 400 }
      );
    }

    const updated = updateAgent(id, data);
    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update agent";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const auth = requireRole(request, "admin");
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { success: false, error: "Agent ID is required" },
      { status: 400 }
    );
  }

  const deleted = deleteAgent(id);
  if (!deleted) {
    return NextResponse.json(
      { success: false, error: "Agent not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
