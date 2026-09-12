export type TaskStatus = "待派" | "执行中" | "已完成" | "已取消";

export const TASK_STATUSES: readonly TaskStatus[] = ["待派", "执行中", "已完成", "已取消"];

/** 允许的状态流转:非法流转一律拦截 */
export const STATUS_FLOW: Record<TaskStatus, readonly TaskStatus[]> = {
  待派: ["执行中", "已取消"],
  执行中: ["已完成", "已取消"],
  已完成: [],
  已取消: []
};

/** 车辆/司机在某一天的可用时段 */
export interface TimeWindow {
  id: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:mm
  end: string; // HH:mm
}

export interface Vehicle {
  id: string;
  plate: string;
  note: string;
  windows: TimeWindow[];
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  windows: TimeWindow[];
}

export interface Task {
  id: string;
  title: string;
  zone: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:mm
  end: string; // HH:mm
  vehicleId: string;
  driverId: string;
  status: TaskStatus;
  notes: string;
  createdAt: string;
}

export type ResourceKind = "vehicle" | "driver";

export interface Conflict {
  taskId: string;
  taskTitle: string;
  taskTime: string;
  taskStatus: TaskStatus;
  resource: string; // 冲突的车辆或司机名称
  reason: string;
}

export type Result = { ok: true } | { ok: false; error: string; conflicts?: Conflict[] };

export const ZONES = ["城北", "城东", "城南"] as const;

/** 是否参与时段冲突占用的状态:已完成、已取消不再占用资源 */
export const OCCUPYING_STATUSES: readonly TaskStatus[] = ["待派", "执行中"];

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  return toDateString(date);
}

export function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
