import { useEffect } from "react";
import { buildDigest } from "../agent/digest";
import { useStore } from "../store/store";
import { useDerived } from "./useDerived";

/**
 * P0-5 optional digest. With no server, it goes out the first time the app is
 * opened each school morning (or from the button in Settings).
 */
export function useDigest() {
  const enabled = useStore((s) => s.settings.digestEnabled);
  const conn = useStore((s) => s.connection);
  const last = useStore((s) => s.lastDigestOn);
  const email = useStore((s) => s.profile.coordinatorEmail);
  const { queue, atRisk, today, ready, snapshot } = useDerived();
  useEffect(() => {
    if (!enabled || !conn || !email || !ready || last === today) return;
    const students = useStore.getState().students;
    const d = buildDigest(queue, atRisk, students, today, window.location.href.split("#")[0]);
    useStore.getState().set({ lastDigestOn: today });
    useStore.getState().sendInternal("digest", [email], d.subject, d.body).catch(() => {});
  }, [enabled, conn, email, ready, last, today, queue, atRisk, snapshot]);
}
