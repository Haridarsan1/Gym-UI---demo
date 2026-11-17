import { useEffect } from "react";
import { useMe } from "@/api/hooks";
import { readGym, writeGym, type GymBrand } from "@/app/gymCache";
import { useSession } from "@/app/SessionContext";

/** The signed-in person’s gym: from the cache straight away, replaced by the real record once it loads. Null until either exists. */
export function useGym(): GymBrand | null {
  const { session } = useSession();
  const me = useMe();
  const tenant = me.data?.tenant;
  useEffect(() => {
    if (tenant) writeGym({ tenantId: tenant.id, name: tenant.name, logoUrl: tenant.logoUrl });
  }, [tenant]);
  if (tenant) return { tenantId: tenant.id, name: tenant.name, logoUrl: tenant.logoUrl };
  return readGym(session?.tenantId);
}
