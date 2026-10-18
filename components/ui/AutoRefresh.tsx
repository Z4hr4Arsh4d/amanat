"use client";
// P1 owns. Q11: re-fetches server data in the background so lists and history stay live without a reload.
// Typed form values are kept (React keeps client state across a refresh).
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
