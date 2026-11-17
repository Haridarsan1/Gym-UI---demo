import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { resetDemo } from "@/demo";
import { useSession } from "@/app/SessionContext";
import { useToast } from "@/design/Toast";

/** Signs out, clears everything cached for the last person, and goes to the login page. */
export function useSignOut(): () => void {
  const { signOut } = useSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  return useCallback(() => {
    signOut();
    client.clear();
    navigate("/login", { replace: true });
  }, [signOut, client, navigate]);
}

/** Puts the demo gym back to how it started. For demos and testing only. */
export function useResetDemo(): () => Promise<void> {
  const client = useQueryClient();
  const toast = useToast();
  return useCallback(async () => {
    try {
      await resetDemo();
      await client.resetQueries();
      toast({ title: "Demo data reset", description: "Pulse Fitness is back to how it started.", tone: "success" });
    } catch {
      toast({ title: "Demo data wasn’t reset", description: "Try again. If it keeps failing, reload the page.", tone: "error" });
    }
  }, [client, toast]);
}
