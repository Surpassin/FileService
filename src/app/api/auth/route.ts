import { NextResponse } from "next/server";
import { authenticateUser, registerUser } from "@/lib/auth";
import { queryOne, execute } from "@/lib/database";
import type { LoginRequest } from "@/types";

export async function POST(request: Request) {
  try {
    const body: LoginRequest = await request.json();
    const { email, password, inviteCode } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (inviteCode) {
      interface InviteRow {
        id: string;
        code: string;
        role: string;
        used_by: string | null;
        expires_at: string;
      }
      const invite = queryOne<InviteRow>(
        "SELECT * FROM invite_codes WHERE code = ?",
        [inviteCode]
      );

      if (!invite) {
        return NextResponse.json(
          { success: false, error: "Invalid invite code" },
          { status: 400 }
        );
      }

      if (invite.used_by) {
        return NextResponse.json(
          { success: false, error: "Invite code already used" },
          { status: 400 }
        );
      }

      if (new Date(invite.expires_at) < new Date()) {
        return NextResponse.json(
          { success: false, error: "Invite code expired" },
          { status: 400 }
        );
      }

      const name = email.split("@")[0];
      const user = await registerUser(
        email,
        password,
        name,
        invite.role as "admin" | "operator" | "viewer"
      );

      execute(
        "UPDATE invite_codes SET used_by = ?, used_at = datetime('now') WHERE id = ?",
        [user.id, invite.id]
      );

      const result = await authenticateUser(email, password);
      if (!result) {
        return NextResponse.json(
          { success: false, error: "Registration failed" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        data: { token: result.token, user: result.user },
      });
    }

    const result = await authenticateUser(email, password);
    if (!result) {
      return NextResponse.json(
        { success: false, error: "Invalid credentials" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { token: result.token, user: result.user },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
