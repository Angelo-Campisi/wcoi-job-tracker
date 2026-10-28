"use client";

import { useEffect, useRef } from "react";
import { isIdle } from "@/lib/sign-in";
import { signOut } from "@/app/sign-in/actions";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart", "scroll", "wheel"] as const;
const CHECK_EVERY_MS = 10_000;

// Locks a shared tablet after a period of no use (spec sections 4 and 10).
// Locking signs the person out on this tablet and returns to the sign-in screen.
export default function InactivityLock({ lockMinutes }: { lockMinutes: number }) {
  const lastActivity = useRef(Date.now());
  const locking = useRef(false);

  useEffect(() => {
    function lockIfIdle() {
      if (!locking.current && isIdle(lastActivity.current, Date.now(), lockMinutes)) {
        locking.current = true;
        void signOut("locked");
      }
    }

    function onActivity() {
      lastActivity.current = Date.now();
    }

    // A tablet coming back from sleep checks right away instead of waiting for the timer.
    function onVisible() {
      if (document.visibilityState === "visible") lockIfIdle();
    }

    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(lockIfIdle, CHECK_EVERY_MS);

    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [lockMinutes]);

  return null;
}
