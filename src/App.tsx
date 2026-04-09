import { HashRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { CalendarPage } from "./pages/CalendarPage";
import { AdminPage } from "./pages/AdminPage";
import { SummaryPage } from "./pages/SummaryPage";
import { getDayFromData, getTodayFromData, getTomorrowFromData, isValidIsoDateInData, useScheduleData } from "./lib/schedule";

function DateRoutePage() {
  const schedule = useScheduleData();
  const params = useParams<{ date: string }>();
  const date = params.date;
  return <SummaryPage day={date && isValidIsoDateInData(schedule, date) ? getDayFromData(schedule, date) : null} />;
}

function AppRoutes() {
  const schedule = useScheduleData();

  return (
    <Routes>
      <Route path="/" element={<SummaryPage day={getTodayFromData(schedule)} />} />
      <Route path="/tomorrow" element={<SummaryPage day={getTomorrowFromData(schedule)} />} />
      <Route path="/date/:date" element={<DateRoutePage />} />
      <Route path="/calendar" element={<CalendarPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
