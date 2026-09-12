import { defineStore } from "pinia";
import {
  OCCUPYING_STATUSES,
  STATUS_FLOW,
  overlaps,
  shiftDate,
  toDateString,
  uid,
  type Conflict,
  type Driver,
  type ResourceKind,
  type Result,
  type Task,
  type TaskStatus,
  type TimeWindow,
  type Vehicle
} from "./types";

const STORAGE_KEY = "dfwlfront-3-dispatch-v2";

interface State {
  vehicles: Vehicle[];
  drivers: Driver[];
  tasks: Task[];
}

function seedState(): State {
  const today = toDateString(new Date());
  const tomorrow = shiftDate(today, 1);
  const yesterday = shiftDate(today, -1);
  const vehicles: Vehicle[] = [
    { id: "v-1", plate: "沪A-82L6", note: "厢式货车", windows: [{ id: "w-1", date: today, start: "08:00", end: "18:00" }] },
    { id: "v-2", plate: "沪B-73K9", note: "冷藏车", windows: [{ id: "w-2", date: today, start: "07:30", end: "17:30" }] },
    { id: "v-3", plate: "沪C-56M2", note: "面包车", windows: [] }
  ];
  const drivers: Driver[] = [
    { id: "d-1", name: "董飞", phone: "13800000001", windows: [{ id: "w-3", date: today, start: "08:00", end: "20:00" }] },
    { id: "d-2", name: "周航", phone: "13800000002", windows: [{ id: "w-4", date: today, start: "07:00", end: "18:00" }] },
    { id: "d-3", name: "林岚", phone: "13800000003", windows: [] }
  ];
  const tasks: Task[] = [
    {
      id: "t-1",
      title: "商超补货",
      zone: "城北",
      date: today,
      start: "09:00",
      end: "11:00",
      vehicleId: "v-1",
      driverId: "d-1",
      status: "待派",
      notes: "可立即派车",
      createdAt: new Date().toISOString()
    },
    {
      id: "t-2",
      title: "医药配送",
      zone: "城东",
      date: today,
      start: "08:30",
      end: "12:00",
      vehicleId: "v-2",
      driverId: "d-2",
      status: "执行中",
      notes: "冷链全程 2-8℃",
      createdAt: new Date().toISOString()
    },
    {
      id: "t-3",
      title: "生鲜直送",
      zone: "城南",
      date: tomorrow,
      start: "10:00",
      end: "12:00",
      vehicleId: "v-2",
      driverId: "d-2",
      status: "待派",
      notes: "明早装车",
      createdAt: new Date().toISOString()
    },
    {
      id: "t-4",
      title: "建材转运",
      zone: "城北",
      date: yesterday,
      start: "14:00",
      end: "16:00",
      vehicleId: "v-1",
      driverId: "d-1",
      status: "已完成",
      notes: "已签收",
      createdAt: new Date().toISOString()
    }
  ];
  return { vehicles, drivers, tasks };
}

function loadState(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as State;
    if (!Array.isArray(parsed.vehicles) || !Array.isArray(parsed.drivers) || !Array.isArray(parsed.tasks)) {
      return seedState();
    }
    return parsed;
  } catch {
    return seedState();
  }
}

export const useDispatchStore = defineStore("dispatch", {
  state: (): State => loadState(),

  getters: {
    tasksOn: (state) => (date: string) =>
      state.tasks
        .filter((task) => task.date === date)
        .slice()
        .sort((a, b) => a.start.localeCompare(b.start) || a.createdAt.localeCompare(b.createdAt)),
    vehicleById: (state) => (id: string) => state.vehicles.find((v) => v.id === id),
    driverById: (state) => (id: string) => state.drivers.find((d) => d.id === id),
    windowsOn: (state) => (kind: ResourceKind, id: string, date: string): TimeWindow[] => {
      const resource = kind === "vehicle"
        ? state.vehicles.find((v) => v.id === id)
        : state.drivers.find((d) => d.id === id);
      return resource ? resource.windows.filter((w) => w.date === date) : [];
    }
  },

  actions: {
    persist() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        vehicles: this.vehicles,
        drivers: this.drivers,
        tasks: this.tasks
      }));
    },

    addVehicle(plate: string, note: string): Result {
      const name = plate.trim();
      if (!name) return { ok: false, error: "请填写车牌号" };
      if (this.vehicles.some((v) => v.plate === name)) {
        return { ok: false, error: `车辆 ${name} 已存在` };
      }
      this.vehicles.push({ id: uid(), plate: name, note: note.trim(), windows: [] });
      this.persist();
      return { ok: true };
    },

    addDriver(name: string, phone: string): Result {
      const trimmed = name.trim();
      if (!trimmed) return { ok: false, error: "请填写司机姓名" };
      if (this.drivers.some((d) => d.name === trimmed)) {
        return { ok: false, error: `司机 ${trimmed} 已存在` };
      }
      this.drivers.push({ id: uid(), name: trimmed, phone: phone.trim(), windows: [] });
      this.persist();
      return { ok: true };
    },

    addWindow(kind: ResourceKind, id: string, date: string, start: string, end: string): Result {
      const resource = kind === "vehicle"
        ? this.vehicles.find((v) => v.id === id)
        : this.drivers.find((d) => d.id === id);
      if (!resource) return { ok: false, error: "资源不存在" };
      if (!date || !start || !end) return { ok: false, error: "请完整选择日期和时段" };
      if (start >= end) return { ok: false, error: "可用时段的开始时间必须早于结束时间" };
      const duplicated = resource.windows.some(
        (w) => w.date === date && overlaps(start, end, w.start, w.end)
      );
      if (duplicated) return { ok: false, error: "该时段与已有可用时段重叠" };
      resource.windows.push({ id: uid(), date, start, end });
      resource.windows.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
      this.persist();
      return { ok: true };
    },

    removeWindow(kind: ResourceKind, id: string, windowId: string) {
      const resource = kind === "vehicle"
        ? this.vehicles.find((v) => v.id === id)
        : this.drivers.find((d) => d.id === id);
      if (!resource) return;
      resource.windows = resource.windows.filter((w) => w.id !== windowId);
      this.persist();
    },

    /** 校验某条任务的车/人指派:可用时段 + 时段冲突。excludeTaskId 用于改派时排除自身 */
    checkAssignment(input: {
      date: string;
      start: string;
      end: string;
      vehicleId: string;
      driverId: string;
      excludeTaskId?: string;
    }): { error?: string; conflicts?: Conflict[] } {
      const vehicle = this.vehicles.find((v) => v.id === input.vehicleId);
      const driver = this.drivers.find((d) => d.id === input.driverId);
      if (!vehicle) return { error: "请选择车辆" };
      if (!driver) return { error: "请选择司机" };

      const fitsWindow = (windows: TimeWindow[]) =>
        windows.some((w) => w.date === input.date && w.start <= input.start && input.end <= w.end);

      const vehicleWindows = vehicle.windows.filter((w) => w.date === input.date);
      if (vehicleWindows.length > 0 && !fitsWindow(vehicleWindows)) {
        const spans = vehicleWindows.map((w) => `${w.start}-${w.end}`).join("、");
        return { error: `车辆 ${vehicle.plate} 当天可用时段为 ${spans},任务时间不在可用范围内` };
      }
      const driverWindows = driver.windows.filter((w) => w.date === input.date);
      if (driverWindows.length > 0 && !fitsWindow(driverWindows)) {
        const spans = driverWindows.map((w) => `${w.start}-${w.end}`).join("、");
        return { error: `司机 ${driver.name} 当天可用时段为 ${spans},任务时间不在可用范围内` };
      }

      const conflicts: Conflict[] = [];
      for (const task of this.tasks) {
        if (task.id === input.excludeTaskId) continue;
        if (task.date !== input.date) continue;
        if (!OCCUPYING_STATUSES.includes(task.status)) continue;
        if (!overlaps(input.start, input.end, task.start, task.end)) continue;
        const time = `${task.start}-${task.end}`;
        if (task.vehicleId === input.vehicleId) {
          conflicts.push({
            taskId: task.id,
            taskTitle: task.title,
            taskTime: time,
            taskStatus: task.status,
            resource: `车辆 ${vehicle.plate}`,
            reason: `车辆 ${vehicle.plate} 在该时段已有任务`
          });
        }
        if (task.driverId === input.driverId) {
          conflicts.push({
            taskId: task.id,
            taskTitle: task.title,
            taskTime: time,
            taskStatus: task.status,
            resource: `司机 ${driver.name}`,
            reason: `司机 ${driver.name} 在该时段已有任务`
          });
        }
      }
      if (conflicts.length > 0) return { conflicts };
      return {};
    },

    addTask(input: {
      title: string;
      zone: string;
      date: string;
      start: string;
      end: string;
      vehicleId: string;
      driverId: string;
      notes: string;
    }): Result {
      if (!input.title.trim()) return { ok: false, error: "请填写任务名称" };
      if (!input.date) return { ok: false, error: "请选择任务日期" };
      if (!input.start || !input.end) return { ok: false, error: "请选择任务起止时间" };
      if (input.start >= input.end) return { ok: false, error: "任务开始时间必须早于结束时间" };

      const check = this.checkAssignment(input);
      if (check.error) return { ok: false, error: check.error };
      if (check.conflicts) {
        return { ok: false, error: "派单失败:时段与未完成任务冲突", conflicts: check.conflicts };
      }

      this.tasks.unshift({
        id: uid(),
        title: input.title.trim(),
        zone: input.zone,
        date: input.date,
        start: input.start,
        end: input.end,
        vehicleId: input.vehicleId,
        driverId: input.driverId,
        status: "待派",
        notes: input.notes.trim() || "暂无备注",
        createdAt: new Date().toISOString()
      });
      this.persist();
      return { ok: true };
    },

    /** 状态流转,非法流转直接拦截 */
    transition(taskId: string, target: TaskStatus): Result {
      const task = this.tasks.find((t) => t.id === taskId);
      if (!task) return { ok: false, error: "任务不存在" };
      if (!STATUS_FLOW[task.status].includes(target)) {
        return { ok: false, error: `非法流转:任务当前为「${task.status}」,不能变更为「${target}」` };
      }
      task.status = target;
      this.persist();
      return { ok: true };
    },

    /** 改派:仅待派/执行中可改派,需重新通过冲突校验 */
    reassign(taskId: string, patch: {
      vehicleId: string;
      driverId: string;
      start: string;
      end: string;
    }): Result {
      const task = this.tasks.find((t) => t.id === taskId);
      if (!task) return { ok: false, error: "任务不存在" };
      if (task.status === "已完成" || task.status === "已取消") {
        return { ok: false, error: `非法流转:任务已${task.status === "已完成" ? "完成" : "取消"},不能改派` };
      }
      if (!patch.start || !patch.end) return { ok: false, error: "请选择任务起止时间" };
      if (patch.start >= patch.end) return { ok: false, error: "任务开始时间必须早于结束时间" };

      const check = this.checkAssignment({
        date: task.date,
        start: patch.start,
        end: patch.end,
        vehicleId: patch.vehicleId,
        driverId: patch.driverId,
        excludeTaskId: task.id
      });
      if (check.error) return { ok: false, error: check.error };
      if (check.conflicts) {
        return { ok: false, error: "改派失败:时段与未完成任务冲突", conflicts: check.conflicts };
      }

      task.vehicleId = patch.vehicleId;
      task.driverId = patch.driverId;
      task.start = patch.start;
      task.end = patch.end;
      this.persist();
      return { ok: true };
    }
  }
});
