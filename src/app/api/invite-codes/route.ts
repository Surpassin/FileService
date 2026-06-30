import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireRole } from "@/lib/auth";
import { queryAll, execute } from "@/lib/database";
import type { InviteCode } from "@/types";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `OMNII-${code}`;
}

interface InviteRow {
  id: string;
  code: string;
  role: string;
  created_by: string;
  used_by: string | null;
  used_at: string | null;
  expires_at: string;
  created_at: string;
}

function rowToInviteCode(row: InviteRow): InviteCode {
  return {
    id: row.id,
    code: row.code,
    role: row.role as InviteCode["role"],
    createdBy: row.created_by,
    usedBy: row.used_by,
    usedAt: row.used_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export async function GET(request: Request) {
  const auth = requireRole(request, "admin");
  if (auth instanceof Response) return auth;

  const rows = queryAll<InviteRow>(
    "SELECT * FROM invite_codes ORDER BY created_at DESC"
  );
  const codes = rows.map(rowToInviteCode);

  return NextResponse.json({ success: true, data: codes });
}

export async function POST(request: Request) {
  const auth = requireRole(request, "admin");
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const { role = "viewer", expiresInHours = 48 } = body;

    if (!["admin", "operator", "viewer"].includes(role)) {
      return NextResponse.json(
        { success: false, error: "Invalid role" },
        { status: 400 }
      );
    }

    const id = uuidv4();
    const code = generateCode();
    const expiresAt = new Date(
      Date.now() + expiresInHours * 60 * 60 * 1000
    ).toISOString();

    execute(
      "INSERT INTO invite_codes (id, code, role, created_by, expires_at) VALUES (?, ?, ?, ?, ?)",
      [id, code, role, auth.userId, expiresAt]
    );

    const inviteCode: InviteCode = {
      id,
      code,
      role: role as InviteCode["role"],
      createdBy: auth.userId,
      usedBy: null,
      usedAt: null,
      expiresAt,
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json(
      { success: true, data: inviteCode },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create invite code";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
