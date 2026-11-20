import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// A restored date URL is a previous viewing choice, not the app's start page.
export function useTodayRoute(today: string) {
  const previousDay = useRef<string | null>(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const startingOrNewDay = previousDay.current !== today;
    previousDay.current = today;
    const isScheduleView = pathname.startsWith("/date/") || pathname === "/tomorrow" || pathname === "/calendar";
    if (startingOrNewDay && isScheduleView) {
      navigate("/", { replace: true });
    }
  }, [today, pathname, navigate]);
}
