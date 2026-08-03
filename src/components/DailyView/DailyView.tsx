import { Check, Plus, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import { DatePicker } from "../DatePicker/DatePicker";
import { createId, ensureDaily } from "../../lib/plannerData";
import type { DailyEntry, DailyTask, PlannerData, TaskPriority, TaskStatus } from "../../types/planner";
import "./DailyView.css";

interface DailyViewProps {
  data: PlannerData;
  setData: Dispatch<SetStateAction<PlannerData>>;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
}

export function DailyView({ data, setData, selectedDate, setSelectedDate }: DailyViewProps) {
  const entry = ensureDaily(data, selectedDate);
  const [draftTask, setDraftTask] = useState("");
  const [draftStatus, setDraftStatus] = useState<TaskStatus>("planned");
  const [draftPriority, setDraftPriority] = useState<TaskPriority>("P3");

  function updateEntry(nextEntry: DailyEntry) {
    setData((current) => ({
      ...current,
      daily: { ...current.daily, [selectedDate]: nextEntry },
    }));
  }

  function addTask() {
    const title = draftTask.trim();
    if (!title) {
      return;
    }

    updateEntry({
      ...entry,
      tasks: [
        ...entry.tasks,
        {
          id: createId(),
          title,
          status: draftStatus,
          priority: draftPriority,
        },
      ],
    });
    setDraftTask("");
  }

  function updateTask(taskId: string, nextTask: DailyTask) {
    updateEntry({
      ...entry,
      tasks: entry.tasks.map((task) => (task.id === taskId ? nextTask : task)),
    });
  }

  function removeTask(taskId: string) {
    updateEntry({ ...entry, tasks: entry.tasks.filter((task) => task.id !== taskId) });
  }

  return (
    <>
      <header className="view-header">
        <div>
          <h2>Daily Plan</h2>
        </div>
        <DatePicker value={selectedDate} onChange={setSelectedDate} />
      </header>

      <div className="daily-grid">
        <section className="planner-panel daily-tasks-panel">
          <div className="panel-title-row daily-task-title">
            <h3>Tasks</h3>
          </div>
          <div className="task-composer">
            <textarea
              className="task-draft-input"
              onChange={(event) => setDraftTask(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  addTask();
                }
              }}
              placeholder="Add a task, follow-up, or priority"
              rows={2}
              value={draftTask}
            />
            <select
              className="select-input"
              value={draftStatus}
              onChange={(event) => setDraftStatus(event.target.value as TaskStatus)}
            >
              <option value="pool">Pool</option>
              <option value="planned">Planned</option>
              <option value="inProgress">In Progress</option>
              <option value="waiting">Waiting</option>
            </select>
            <select
              className="select-input"
              value={draftPriority}
              onChange={(event) => setDraftPriority(event.target.value as TaskPriority)}
            >
              <option value="P1">P1</option>
              <option value="P2">P2</option>
              <option value="P3">P3</option>
              <option value="P4">P4</option>
            </select>
            <button
              className="primary-button"
              disabled={!draftTask.trim()}
              type="button"
              onClick={addTask}
            >
              <Plus size={17} />
              Add
            </button>
          </div>
          <div className="daily-sections">
            <TaskSection
              tasks={getTopFocusTasks(entry.tasks)}
              title="Top 3 Focus"
              updateTask={updateTask}
              removeTask={removeTask}
            />
            <TaskSection
              tasks={entry.tasks.filter((task) => task.status === "inProgress")}
              title="In Progress"
              updateTask={updateTask}
              removeTask={removeTask}
            />
            <TaskSection
              tasks={entry.tasks.filter((task) => task.status === "planned")}
              title="Planned"
              updateTask={updateTask}
              removeTask={removeTask}
            />
            <TaskSection
              tasks={entry.tasks.filter((task) => task.status === "waiting")}
              title="Waiting"
              updateTask={updateTask}
              removeTask={removeTask}
            />
            <TaskSection
              tasks={entry.tasks.filter((task) => task.status === "pool")}
              title="Pool"
              updateTask={updateTask}
              removeTask={removeTask}
            />
            <TaskSection
              tasks={entry.tasks.filter((task) => task.status === "done")}
              title="Done"
              updateTask={updateTask}
              removeTask={removeTask}
            />
          </div>
        </section>
      </div>
    </>
  );
}

interface TaskSectionProps {
  title: string;
  tasks: DailyTask[];
  updateTask: (taskId: string, nextTask: DailyTask) => void;
  removeTask: (taskId: string) => void;
}

function TaskSection({ title, tasks, updateTask, removeTask }: TaskSectionProps) {
  if (tasks.length === 0) {
    return null;
  }

  return (
    <section className="task-section">
      <h4>{title}</h4>
      <div className="task-list">
        {tasks.map((task, index) => (
          <div className={task.status === "done" ? "task-row done" : "task-row"} key={task.id}>
            <button
              className="task-check-button"
              type="button"
              title={task.status === "done" ? "Mark planned" : "Complete task"}
              onClick={() =>
                updateTask(task.id, {
                  ...task,
                  status: task.status === "done" ? "planned" : "done",
                })
              }
            >
              <Check size={15} />
            </button>
            <span className="task-number">{String(index + 1).padStart(2, "0")}</span>
            <div className="task-copy">
              <span className={`task-priority-badge ${task.priority}`}>{task.priority}</span>
              <input
                className="task-title-input"
                placeholder="Task"
                value={task.title}
                onChange={(event) => updateTask(task.id, { ...task, title: event.target.value })}
              />
            </div>
            <select
              className="select-input task-status"
              value={task.status}
              onChange={(event) =>
                updateTask(task.id, {
                  ...task,
                  status: event.target.value as DailyTask["status"],
                })
              }
            >
              <option value="pool">Pool</option>
              <option value="planned">Planned</option>
              <option value="inProgress">In Progress</option>
              <option value="waiting">Waiting</option>
              <option value="done">Done</option>
            </select>
            <select
              className="select-input task-priority"
              value={task.priority}
              onChange={(event) =>
                updateTask(task.id, {
                  ...task,
                  priority: event.target.value as DailyTask["priority"],
                })
              }
            >
              <option value="P1">P1</option>
              <option value="P2">P2</option>
              <option value="P3">P3</option>
              <option value="P4">P4</option>
            </select>
            <button
              className="icon-button"
              type="button"
              title="Remove task"
              onClick={() => removeTask(task.id)}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function getTopFocusTasks(tasks: DailyTask[]): DailyTask[] {
  return tasks
    .filter((task) => task.status !== "done")
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
    .slice(0, 3);
}

function priorityRank(priority: TaskPriority): number {
  return { P1: 1, P2: 2, P3: 3, P4: 4 }[priority];
}
