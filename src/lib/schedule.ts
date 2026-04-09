import { useEffect, useState } from "react";
import rawData from "../data/generated/schedule.json";
import type { DaySummary, MonthSummary, ScheduleData } from "../types";
import { loadPublishedViewerOverride, VIEWER_OVERRIDE_STORAGE_KEY, VIEWER_OVERRIDE_UPDATED_EVENT } from "./admin";
import { parseIsoDate, toIsoDate } from "./date";

const bundledData = rawData as ScheduleData;

function getActiveData() {
  return loadPublishedViewerOverride() ?? bundledData;
}

function getDayMap(data: ScheduleData) {
  return new Map(data.days.map((day) => [day.date, day]));
}

export function useScheduleData() {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const handleOverrideUpdate = () => {
      setVersion((version) => version + 1);
    };
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === VIEWER_OVERRIDE_STORAGE_KEY) {
        handleOverrideUpdate();
      }
    };

    window.addEventListener(VIEWER_OVERRIDE_UPDATED_EVENT, handleOverrideUpdate);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(VIEWER_OVERRIDE_UPDATED_EVENT, handleOverrideUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return getActiveData();
}

export function getScheduleData() {
  return getActiveData();
}

export function getDayFromData(data: ScheduleData, date: string) {
  return getDayMap(data).get(date) ?? null;
}

export function getDay(date: string) {
  return getDayFromData(getActiveData(), date);
}

export function getTodayFromData(data: ScheduleData) {
  return getDayFromData(data, toIsoDate(new Date()));
}

export function getToday() {
  return getTodayFromData(getActiveData());
}

export function getTomorrowFromData(data: ScheduleData) {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return getDayFromData(data, toIsoDate(date));
}

export function getTomorrow() {
  return getTomorrowFromData(getActiveData());
}

export function getLatestDay() {
  const data = getActiveData();
  return data.days[data.days.length - 1] ?? null;
}

export function getMonthFromData(data: ScheduleData, key: string) {
  return data.months.find((month) => month.key === key) ?? null;
}

export function getMonth(key: string) {
  return getMonthFromData(getActiveData(), key);
}

export function getInitialMonthFromData(data: ScheduleData): MonthSummary | null {
  const currentMonth = toIsoDate(new Date()).slice(0, 7);
  return getMonthFromData(data, currentMonth) ?? data.months[data.months.length - 1] ?? null;
}

export function getInitialMonth(): MonthSummary | null {
  return getInitialMonthFromData(getActiveData());
}

export function getDaysForMonthFromData(data: ScheduleData, key: string) {
  const month = getMonthFromData(data, key);
  if (!month) return [];
  return month.dates.map((date) => getDayFromData(data, date)).filter(Boolean) as DaySummary[];
}

export function getDaysForMonth(key: string) {
  return getDaysForMonthFromData(getActiveData(), key);
}

export function isValidIsoDateInData(data: ScheduleData, value?: string) {
  if (!value) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseIsoDate(value);
  return toIsoDate(date) === value && getDayMap(data).has(value);
}

export function isValidIsoDate(value?: string) {
  return isValidIsoDateInData(getActiveData(), value);
}
