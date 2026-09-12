<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useDispatchStore } from "./store";
import {
  TASK_STATUSES,
  ZONES,
  shiftDate,
  toDateString,
  type Conflict,
  type ResourceKind,
  type Task,
  type TaskStatus
} from "./types";

const project = {
  title: "车辆调度排班台",
  subtitle: "按日期排班:维护车辆、司机与当天可用时段,为配送任务派单,自动拦截时段冲突与非法流转。",
  industry: "物流",
  stack: ["Vue3", "Vite", "TypeScript", "Pinia", "Naive UI"]
} as const;

const store = useDispatchStore();

const selectedDate = ref(toDateString(new Date()));
const statusFilter = ref<"全部" | TaskStatus>("全部");

interface Feedback {
  type: "error" | "success";
  text: string;
  conflicts?: Conflict[];
}
const feedback = ref<Feedback | null>(null);

function showResult(result: { ok: true } | { ok: false; error: string; conflicts?: Conflict[] }, okText: string) {
  feedback.value = result.ok
    ? { type: "success", text: okText }
    : { type: "error", text: result.error, conflicts: result.conflicts };
}

/* ---------- 日期 ---------- */
const dateLabel = computed(() => {
  const [y, m, d] = selectedDate.value.split("-").map(Number);
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][new Date(y, m - 1, d).getDay()];
  return `${y}年${m}月${d}日 ${weekday}`;
});
const isToday = computed(() => selectedDate.value === toDateString(new Date()));
function moveDate(days: number) {
  selectedDate.value = shiftDate(selectedDate.value, days);
}
function backToToday() {
  selectedDate.value = toDateString(new Date());
}

/* ---------- 当天任务与指标 ---------- */
const dayTasks = computed(() => store.tasksOn(selectedDate.value));
const visibleTasks = computed(() =>
  statusFilter.value === "全部" ? dayTasks.value : dayTasks.value.filter((t) => t.status === statusFilter.value)
);
const metrics = computed(() => [
  { label: "当天任务", value: dayTasks.value.length },
  { label: "待派", value: dayTasks.value.filter((t) => t.status === "待派").length },
  { label: "执行中", value: dayTasks.value.filter((t) => t.status === "执行中").length },
  { label: "已完成", value: dayTasks.value.filter((t) => t.status === "已完成").length }
]);
const chartRows = computed(() =>
  TASK_STATUSES.map((status) => ({ status, value: dayTasks.value.filter((t) => t.status === status).length }))
);
const maxChart = computed(() => Math.max(1, ...chartRows.value.map((row) => row.value)));

/* ---------- 资源展示 ---------- */
function resourceName(kind: ResourceKind, id: string) {
  if (kind === "vehicle") return store.vehicleById(id)?.plate ?? "已删除车辆";
  return store.driverById(id)?.name ?? "已删除司机";
}
function windowLabel(kind: ResourceKind, id: string) {
  const windows = store.windowsOn(kind, id, selectedDate.value);
  if (windows.length === 0) return "全天可用";
  return windows.map((w) => `${w.start}-${w.end}`).join("、");
}

/* ---------- 新增任务 ---------- */
const taskForm = reactive({
  title: "",
  zone: ZONES[0] as string,
  date: selectedDate.value,
  start: "",
  end: "",
  vehicleId: "",
  driverId: "",
  notes: ""
});
watch(selectedDate, (date) => {
  taskForm.date = date;
});
function submitTask() {
  const result = store.addTask({ ...taskForm });
  showResult(result, `已派单:「${taskForm.title}」(${taskForm.date} ${taskForm.start}-${taskForm.end})`);
  if (result.ok) {
    taskForm.title = "";
    taskForm.start = "";
    taskForm.end = "";
    taskForm.notes = "";
    if (taskForm.date !== selectedDate.value) selectedDate.value = taskForm.date;
  }
}

/* ---------- 新增车辆 / 司机 ---------- */
const vehicleForm = reactive({ plate: "", note: "" });
const driverForm = reactive({ name: "", phone: "" });
function submitVehicle() {
  const result = store.addVehicle(vehicleForm.plate, vehicleForm.note);
  showResult(result, `已新增车辆 ${vehicleForm.plate.trim()}`);
  if (result.ok) {
    vehicleForm.plate = "";
    vehicleForm.note = "";
  }
}
function submitDriver() {
  const result = store.addDriver(driverForm.name, driverForm.phone);
  showResult(result, `已新增司机 ${driverForm.name.trim()}`);
  if (result.ok) {
    driverForm.name = "";
    driverForm.phone = "";
  }
}

/* ---------- 可用时段 ---------- */
const windowForms = reactive<Record<string, { start: string; end: string }>>({});
function windowForm(key: string) {
  if (!windowForms[key]) windowForms[key] = { start: "", end: "" };
  return windowForms[key];
}
function submitWindow(kind: ResourceKind, id: string) {
  const form = windowForm(`${kind}-${id}`);
  const result = store.addWindow(kind, id, selectedDate.value, form.start, form.end);
  const label = kind === "vehicle" ? resourceName("vehicle", id) : resourceName("driver", id);
  showResult(result, `已为 ${label} 设置 ${selectedDate.value} 可用时段 ${form.start}-${form.end}`);
  if (result.ok) {
    form.start = "";
    form.end = "";
  }
}
function removeWindow(kind: ResourceKind, id: string, windowId: string) {
  store.removeWindow(kind, id, windowId);
  feedback.value = { type: "success", text: "已移除该可用时段" };
}

/* ---------- 任务操作 ---------- */
function transit(task: Task, target: TaskStatus) {
  const result = store.transition(task.id, target);
  showResult(result, `「${task.title}」已流转为 ${target}`);
}
function cancelTask(task: Task) {
  transit(task, "已取消");
}

/* ---------- 改派 ---------- */
const reassignTarget = ref<Task | null>(null);
const reassignForm = reactive({ vehicleId: "", driverId: "", start: "", end: "" });
const reassignError = ref<Feedback | null>(null);
function openReassign(task: Task) {
  reassignTarget.value = task;
  reassignForm.vehicleId = task.vehicleId;
  reassignForm.driverId = task.driverId;
  reassignForm.start = task.start;
  reassignForm.end = task.end;
  reassignError.value = null;
}
function closeReassign() {
  reassignTarget.value = null;
  reassignError.value = null;
}
function submitReassign() {
  const task = reassignTarget.value;
  if (!task) return;
  const result = store.reassign(task.id, { ...reassignForm });
  if (result.ok) {
    feedback.value = { type: "success", text: `「${task.title}」已改派` };
    closeReassign();
  } else {
    reassignError.value = { type: "error", text: result.error, conflicts: result.conflicts };
  }
}

/* ---------- 展示辅助 ---------- */
const statusClass: Record<TaskStatus, string> = {
  待派: "st-pending",
  执行中: "st-running",
  已完成: "st-done",
  已取消: "st-cancelled"
};
function taskTime(task: Task) {
  return `${task.start} - ${task.end}`;
}
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">{{ project.industry }}行业 · 按日期排班调度台</p>
          <h1>{{ project.title }}</h1>
          <p class="subtitle">{{ project.subtitle }}</p>
        </div>
        <div class="stack">
          <span v-for="item in project.stack" :key="item" class="tag">{{ item }}</span>
        </div>
      </header>

      <section class="datebar">
        <div class="date-nav">
          <button type="button" class="secondary" @click="moveDate(-1)">◀ 前一天</button>
          <input v-model="selectedDate" type="date" aria-label="选择排班日期" />
          <button type="button" class="secondary" @click="moveDate(1)">后一天 ▶</button>
          <button v-if="!isToday" type="button" @click="backToToday">回到今天</button>
        </div>
        <p class="date-label">{{ dateLabel }}<span v-if="isToday" class="today-chip">今天</span></p>
      </section>

      <section class="metrics">
        <article v-for="metric in metrics" :key="metric.label" class="metric">
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
        </article>
      </section>

      <transition name="fade">
        <div v-if="feedback" class="banner" :class="feedback.type" role="alert">
          <div class="banner-body">
            <strong>{{ feedback.type === "error" ? "操作被拦截" : "操作成功" }}:</strong>
            <span>{{ feedback.text }}</span>
            <ul v-if="feedback.conflicts && feedback.conflicts.length" class="conflict-list">
              <li v-for="(conflict, index) in feedback.conflicts" :key="index">
                冲突任务「{{ conflict.taskTitle }}」({{ conflict.taskTime }},{{ conflict.taskStatus }})
                —— {{ conflict.reason }}
              </li>
            </ul>
          </div>
          <button type="button" class="banner-close" aria-label="关闭提示" @click="feedback = null">✕</button>
        </div>
      </transition>

      <section class="workspace">
        <div class="side">
          <form class="panel" @submit.prevent="submitTask">
            <h2>新增配送任务</h2>
            <div class="form-grid">
              <label>
                任务名称
                <input v-model="taskForm.title" type="text" placeholder="如:商超补货" required />
              </label>
              <label>
                配送区域
                <select v-model="taskForm.zone">
                  <option v-for="zone in ZONES" :key="zone" :value="zone">{{ zone }}</option>
                </select>
              </label>
              <label>
                任务日期
                <input v-model="taskForm.date" type="date" required />
              </label>
              <div class="time-row">
                <label>
                  开始时间
                  <input v-model="taskForm.start" type="time" required />
                </label>
                <label>
                  结束时间
                  <input v-model="taskForm.end" type="time" required />
                </label>
              </div>
              <label>
                车辆
                <select v-model="taskForm.vehicleId" required>
                  <option value="" disabled>请选择车辆</option>
                  <option v-for="vehicle in store.vehicles" :key="vehicle.id" :value="vehicle.id">
                    {{ vehicle.plate }}({{ windowLabel("vehicle", vehicle.id) }})
                  </option>
                </select>
              </label>
              <label>
                司机
                <select v-model="taskForm.driverId" required>
                  <option value="" disabled>请选择司机</option>
                  <option v-for="driver in store.drivers" :key="driver.id" :value="driver.id">
                    {{ driver.name }}({{ windowLabel("driver", driver.id) }})
                  </option>
                </select>
              </label>
              <label>
                备注
                <textarea v-model="taskForm.notes" placeholder="填写配送说明或现场备注" />
              </label>
              <button type="submit">派单</button>
            </div>
          </form>

          <section class="panel">
            <h2>车辆管理</h2>
            <form class="inline-form" @submit.prevent="submitVehicle">
              <input v-model="vehicleForm.plate" type="text" placeholder="车牌号" required />
              <input v-model="vehicleForm.note" type="text" placeholder="备注(车型等)" />
              <button type="submit">新增车辆</button>
            </form>
            <div class="resource-list">
              <article v-for="vehicle in store.vehicles" :key="vehicle.id" class="resource">
                <div class="resource-head">
                  <strong>{{ vehicle.plate }}</strong>
                  <span v-if="vehicle.note" class="resource-note">{{ vehicle.note }}</span>
                </div>
                <div class="windows">
                  <span class="windows-label">当天可用时段:</span>
                  <template v-if="store.windowsOn('vehicle', vehicle.id, selectedDate).length">
                    <span
                      v-for="w in store.windowsOn('vehicle', vehicle.id, selectedDate)"
                      :key="w.id"
                      class="window-chip"
                    >
                      {{ w.start }}-{{ w.end }}
                      <button
                        type="button"
                        class="chip-remove"
                        :aria-label="`移除${vehicle.plate}的时段${w.start}-${w.end}`"
                        @click="removeWindow('vehicle', vehicle.id, w.id)"
                      >✕</button>
                    </span>
                  </template>
                  <span v-else class="windows-empty">未设置(默认全天可用)</span>
                </div>
                <form class="window-form" @submit.prevent="submitWindow('vehicle', vehicle.id)">
                  <input v-model="windowForm(`vehicle-${vehicle.id}`).start" type="time" required aria-label="可用开始时间" />
                  <span class="tilde">至</span>
                  <input v-model="windowForm(`vehicle-${vehicle.id}`).end" type="time" required aria-label="可用结束时间" />
                  <button type="submit" class="secondary">添加时段</button>
                </form>
              </article>
            </div>
          </section>

          <section class="panel">
            <h2>司机管理</h2>
            <form class="inline-form" @submit.prevent="submitDriver">
              <input v-model="driverForm.name" type="text" placeholder="司机姓名" required />
              <input v-model="driverForm.phone" type="text" placeholder="联系电话" />
              <button type="submit">新增司机</button>
            </form>
            <div class="resource-list">
              <article v-for="driver in store.drivers" :key="driver.id" class="resource">
                <div class="resource-head">
                  <strong>{{ driver.name }}</strong>
                  <span v-if="driver.phone" class="resource-note">{{ driver.phone }}</span>
                </div>
                <div class="windows">
                  <span class="windows-label">当天可用时段:</span>
                  <template v-if="store.windowsOn('driver', driver.id, selectedDate).length">
                    <span
                      v-for="w in store.windowsOn('driver', driver.id, selectedDate)"
                      :key="w.id"
                      class="window-chip"
                    >
                      {{ w.start }}-{{ w.end }}
                      <button
                        type="button"
                        class="chip-remove"
                        :aria-label="`移除${driver.name}的时段${w.start}-${w.end}`"
                        @click="removeWindow('driver', driver.id, w.id)"
                      >✕</button>
                    </span>
                  </template>
                  <span v-else class="windows-empty">未设置(默认全天可用)</span>
                </div>
                <form class="window-form" @submit.prevent="submitWindow('driver', driver.id)">
                  <input v-model="windowForm(`driver-${driver.id}`).start" type="time" required aria-label="可用开始时间" />
                  <span class="tilde">至</span>
                  <input v-model="windowForm(`driver-${driver.id}`).end" type="time" required aria-label="可用结束时间" />
                  <button type="submit" class="secondary">添加时段</button>
                </form>
              </article>
            </div>
          </section>
        </div>

        <section class="list-panel">
          <div class="toolbar">
            <h2>当日任务 · {{ dateLabel }}</h2>
            <select v-model="statusFilter" aria-label="按状态筛选">
              <option value="全部">全部状态</option>
              <option v-for="status in TASK_STATUSES" :key="status" :value="status">{{ status }}</option>
            </select>
          </div>

          <div class="record-grid">
            <div v-if="visibleTasks.length === 0" class="empty">
              当天暂无{{ statusFilter === "全部" ? "" : `「${statusFilter}」` }}任务,切换日期或新增任务
            </div>
            <article v-for="task in visibleTasks" :key="task.id" class="record">
              <div class="record-head">
                <p class="record-title">{{ task.title }}</p>
                <span class="status" :class="statusClass[task.status]">{{ task.status }}</span>
              </div>
              <div class="details">
                <span>时间: {{ taskTime(task) }}</span>
                <span>区域: {{ task.zone }}</span>
                <span>车辆: {{ resourceName("vehicle", task.vehicleId) }}</span>
                <span>司机: {{ resourceName("driver", task.driverId) }}</span>
              </div>
              <p class="note">{{ task.notes }}</p>
              <div class="actions">
                <template v-if="task.status === '待派'">
                  <button type="button" @click="transit(task, '执行中')">开始执行</button>
                  <button type="button" class="secondary" @click="openReassign(task)">改派</button>
                  <button type="button" class="danger" @click="cancelTask(task)">取消任务</button>
                </template>
                <template v-else-if="task.status === '执行中'">
                  <button type="button" @click="transit(task, '已完成')">完成任务</button>
                  <button type="button" class="secondary" @click="openReassign(task)">改派</button>
                  <button type="button" class="danger" @click="cancelTask(task)">取消任务</button>
                </template>
                <span v-else class="terminal-tip">
                  {{ task.status === "已完成" ? "任务已完成,不可再变更" : "任务已取消,不可再变更" }}
                </span>
              </div>
            </article>
          </div>

          <div class="mini-chart">
            <div v-for="row in chartRows" :key="row.status" class="bar">
              <span>{{ row.status }}</span>
              <div class="bar-track"><div class="bar-fill" :style="{ width: `${(row.value / maxChart) * 100}%` }" /></div>
              <strong>{{ row.value }}</strong>
            </div>
          </div>
        </section>
      </section>
    </div>

    <div v-if="reassignTarget" class="modal-mask" @click.self="closeReassign">
      <div class="modal" role="dialog" aria-modal="true" aria-label="改派任务">
        <h2>改派「{{ reassignTarget.title }}」</h2>
        <p class="modal-sub">任务日期:{{ reassignTarget.date }}(改派仅限当天内调整车辆、司机与时段)</p>
        <div class="form-grid">
          <label>
            车辆
            <select v-model="reassignForm.vehicleId">
              <option v-for="vehicle in store.vehicles" :key="vehicle.id" :value="vehicle.id">
                {{ vehicle.plate }}({{ windowLabel("vehicle", vehicle.id) }})
              </option>
            </select>
          </label>
          <label>
            司机
            <select v-model="reassignForm.driverId">
              <option v-for="driver in store.drivers" :key="driver.id" :value="driver.id">
                {{ driver.name }}({{ windowLabel("driver", driver.id) }})
              </option>
            </select>
          </label>
          <div class="time-row">
            <label>
              开始时间
              <input v-model="reassignForm.start" type="time" required />
            </label>
            <label>
              结束时间
              <input v-model="reassignForm.end" type="time" required />
            </label>
          </div>
          <div v-if="reassignError" class="banner error in-modal" role="alert">
            <div class="banner-body">
              <strong>改派被拦截:</strong>
              <span>{{ reassignError.text }}</span>
              <ul v-if="reassignError.conflicts && reassignError.conflicts.length" class="conflict-list">
                <li v-for="(conflict, index) in reassignError.conflicts" :key="index">
                  冲突任务「{{ conflict.taskTitle }}」({{ conflict.taskTime }},{{ conflict.taskStatus }})
                  —— {{ conflict.reason }}
                </li>
              </ul>
            </div>
          </div>
          <div class="modal-actions">
            <button type="button" @click="submitReassign">确认改派</button>
            <button type="button" class="secondary" @click="closeReassign">取消</button>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>
