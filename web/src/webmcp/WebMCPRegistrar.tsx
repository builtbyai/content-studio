import { useEffect } from "react";
import { useAuth } from "../lib/auth-context";
import { registerContentForgeWebMcpTools } from "./registerContentForgeTools";

// Invisible registrar. Mounts inside App (under AuthProvider); (un)registers
// WebMCP tools as the auth user becomes available / changes / logs out.
// Renders null.
export default function WebMCPRegistrar() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return undefined;
    const unregister = registerContentForgeWebMcpTools();
    return unregister;
  }, [user?.id]);

  return null;
}
