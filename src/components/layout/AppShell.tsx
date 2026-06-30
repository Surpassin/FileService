"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { apiClient } from "@/lib/api-client";
import { connectSocket, disconnectSocket } from "@/lib/socket-client";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const token = apiClient.getToken();
    if (!token) {
      router.push("/");
      return;
    }

    connectSocket(token);

    return () => {
      disconnectSocket();
    };
  }, [router]);

  return (
    <div className="flex min-h-screen bg-dark-0">
      <Sidebar />
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
