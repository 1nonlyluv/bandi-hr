import { useEffect, useState } from "react";
import { toIsoDate } from "../lib/date";

// Timers may pause while the device sleeps or the browser is in the background.
export function useToday() {
  const [today, setToday] = useState(() => toIsoDate(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      const now = new Date();
      setToday(toIsoDate(now));
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      timer = setTimeout(update, midnight.getTime() - now.getTime());
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") update();
    };

    update();
    window.addEventListener("focus", update);
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("pageshow", update);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return today;
}
