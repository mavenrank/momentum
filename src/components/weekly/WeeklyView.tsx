import { useState } from 'react';
import { Check } from 'lucide-react';
import { useTaskStore } from '../../store/useTaskStore';
import { useWeeklyStore } from '../../store/useWeeklyStore';
import { useNoteStore } from '../../store/useNoteStore';
import { useHabitStore } from '../../store/useHabitStore';
import { getWeekId, getWeekRange, getWeekDays, getShortDayName } from '../../utils/date';

const CATEGORY_COLORS = ['#f97316', '#a855f7', '#22c55e', '#eab308', '#3b82f6'];

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type PriorityType = 'top' | 'low' | 'follow-up';

interface PriorityPanelProps {
  type: PriorityType;
  title: string;
  className: string;
  weekId: string;
}

function PriorityPanel({ type, title, className, weekId }: PriorityPanelProps) {
  const [newText, setNewText] = useState('');
  const tasks = useTaskStore((s) => s.tasks);
  const addTask = useTaskStore((s) => s.addTask);
  const toggleTask = useTaskStore((s) => s.toggleTask);

  const priorityTasks = tasks.filter((t) => t.priority === type && t.weekId === weekId);

  function handleAdd() {
    const text = newText.trim();
    if (!text) return;
    addTask({
      text,
      done: false,
      priority: type,
      date: '',
      weekId,
    });
    setNewText('');
  }

  return (
    <div className={`priority-panel ${className}`}>
      <div className="priority-panel-header">{title}</div>
      <div className="priority-items">
        {priorityTasks.map((task) => (
          <div
            key={task.id}
            className={`priority-item${task.done ? ' done' : ''}`}
            onClick={() => toggleTask(task.id)}
          >
            <div className="priority-checkbox">
              {task.done && <Check className="priority-checkbox-icon" />}
            </div>
            <span className="priority-item-text">{task.text}</span>
          </div>
        ))}
      </div>
      <div className="priority-add">
        <input
          className="priority-add-input"
          placeholder="+ Add item"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
      </div>
    </div>
  );
}

function TodoList({ weekId }: { weekId: string }) {
  const [newText, setNewText] = useState('');
  const tasks = useTaskStore((s) => s.tasks);
  const addTask = useTaskStore((s) => s.addTask);
  const toggleTask = useTaskStore((s) => s.toggleTask);

  const todoTasks = tasks.filter((t) => t.priority === 'todo' && t.weekId === weekId);

  function handleAdd() {
    const text = newText.trim();
    if (!text) return;
    const colorIdx = todoTasks.length % CATEGORY_COLORS.length;
    addTask({
      text,
      done: false,
      priority: 'todo',
      date: '',
      weekId,
      categoryColor: CATEGORY_COLORS[colorIdx],
    });
    setNewText('');
  }

  return (
    <div className="todo-panel">
      <div className="todo-header">To Do</div>
      <div className="todo-items">
        {todoTasks.map((task) => (
          <div
            key={task.id}
            className={`todo-item${task.done ? ' done' : ''}`}
            onClick={() => toggleTask(task.id)}
          >
            <span
              className="todo-color-dot"
              style={{ background: task.categoryColor ?? CATEGORY_COLORS[0] }}
            />
            <span className="todo-item-text">{task.text}</span>
          </div>
        ))}
      </div>
      <div className="todo-add">
        <input
          className="todo-add-input"
          placeholder="+ Add to-do"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
      </div>
    </div>
  );
}

function NotesPanel({ weekId }: { weekId: string }) {
  const notes = useNoteStore((s) => s.notes);
  const upsertNote = useNoteStore((s) => s.upsertNote);
  const weeklyNote = notes.find((n) => n.date === weekId && n.type === 'weekly');

  return (
    <div className="notes-panel">
      <div className="notes-header">Notes</div>
      <textarea
        className="notes-textarea"
        placeholder="Weekly notes, reflections, ideas..."
        value={weeklyNote?.content ?? ''}
        onChange={(e) => upsertNote(weekId, 'weekly', e.target.value)}
      />
    </div>
  );
}

function HabitTracker({ weekId }: { weekId: string }) {
  const habits = useHabitStore((s) => s.habits);
  const toggleTracking = useHabitStore((s) => s.toggleTracking);
  const isTracked = useHabitStore((s) => s.isTracked);
  const weekDates = getWeekDays(weekId).map((d) => d.toISOString().split('T')[0]);

  return (
    <div className="habit-tracker">
      <div className="habit-tracker-header">Habit Tracker</div>
      <table className="habit-tracker-table">
        <thead>
          <tr>
            <th>HABITS</th>
            {weekDates.map((d) => (
              <th key={d}>{getShortDayName(d)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {habits.length === 0 && (
            <tr>
              <td colSpan={8} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                No habits yet
              </td>
            </tr>
          )}
          {habits.map((habit) => (
            <tr key={habit.id}>
              <td style={{ fontSize: 12, fontWeight: 500 }}>{habit.name}</td>
              {weekDates.map((d) => {
                const checked = isTracked(habit.id, d);
                return (
                  <td key={d}>
                    <div
                      className={`habit-tracker-cell${checked ? ' checked' : ''}`}
                      onClick={() => toggleTracking(habit.id, d)}
                    >
                      {checked && <Check className="habit-tracker-check" />}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DayScheduleBlock({ dayName, dayIndex, weekId }: { dayName: string; dayIndex: number; weekId: string }) {
  const [newText, setNewText] = useState('');
  const tasks = useTaskStore((s) => s.tasks);
  const addTask = useTaskStore((s) => s.addTask);
  const toggleTask = useTaskStore((s) => s.toggleTask);

  const weekDays = getWeekDays(weekId);
  const dateStr = weekDays[dayIndex]?.toISOString().split('T')[0] ?? '';

  const dayTasks = tasks.filter((t) => t.dayOfWeek === dayName && t.weekId === weekId);

  function handleAdd() {
    const text = newText.trim();
    if (!text) return;
    addTask({
      text,
      done: false,
      priority: 'todo',
      date: dateStr,
      weekId,
      dayOfWeek: dayName,
    });
    setNewText('');
  }

  return (
    <div className="schedule-day-block">
      <div className="schedule-day-header">
        <span>{dayName}</span>
        <span style={{ fontWeight: 400, opacity: 0.6 }}>{weekDays[dayIndex]?.getDate()}</span>
      </div>
      <div className="schedule-day-items">
        {dayTasks.map((task) => (
          <div
            key={task.id}
            className={`schedule-day-item${task.done ? ' done' : ''}`}
            onClick={() => toggleTask(task.id)}
          >
            <span
              style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)],
              }}
            />
            <span>{task.text}</span>
          </div>
        ))}
      </div>
      <div className="schedule-day-add">
        <input
          className="schedule-day-add-input"
          placeholder="+ Add"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
      </div>
    </div>
  );
}

function DayScheduleGrid({ weekId }: { weekId: string }) {
  const leftDays = DAYS_OF_WEEK.slice(0, 3);
  const rightDays = DAYS_OF_WEEK.slice(3);

  return (
    <div className="schedule-grid">
      <div className="schedule-grid-inner">
        <div className="schedule-column">
          {leftDays.map((day, i) => (
            <DayScheduleBlock key={day} dayName={day} dayIndex={i} weekId={weekId} />
          ))}
        </div>
        <div className="schedule-column">
          {rightDays.map((day, i) => (
            <DayScheduleBlock key={day} dayName={day} dayIndex={i + 3} weekId={weekId} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function WeeklyView() {
  const [weekId, setWeekId] = useState(() => getWeekId(new Date()));
  const weeklyPlans = useWeeklyStore((s) => s.plans);
  const upsertPlan = useWeeklyStore((s) => s.upsertPlan);
  const [weeklyFocus, setWeeklyFocus] = useState('');

  const plan = weeklyPlans.find((p) => p.weekOf === weekId);

  function handleFocusChange(value: string) {
    setWeeklyFocus(value);
    upsertPlan(weekId, value, plan?.notes ?? '');
  }

  function prevWeek() {
    const d = new Date(weekId);
    d.setDate(d.getDate() - 7);
    const newWeek = getWeekId(d);
    setWeekId(newWeek);
    const p = weeklyPlans.find((pl) => pl.weekOf === newWeek);
    setWeeklyFocus(p?.weeklyFocus ?? '');
  }

  function nextWeek() {
    const d = new Date(weekId);
    d.setDate(d.getDate() + 7);
    const newWeek = getWeekId(d);
    setWeekId(newWeek);
    const p = weeklyPlans.find((pl) => pl.weekOf === newWeek);
    setWeeklyFocus(p?.weeklyFocus ?? '');
  }

  const isCurrentWeek = weekId === getWeekId(new Date());

  return (
    <div className="weekly-view">
      <div className="weekly-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 className="weekly-title">WEEKLY PLAN</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" onClick={prevWeek}>← Prev</button>
            <button className="btn btn-sm btn-primary" onClick={() => {
              const w = getWeekId(new Date());
              setWeekId(w);
              const p = weeklyPlans.find((pl) => pl.weekOf === w);
              setWeeklyFocus(p?.weeklyFocus ?? '');
            }}>Current Week</button>
            <button className="btn btn-sm" onClick={nextWeek}>Next →</button>
          </div>
        </div>
        <div className="weekly-meta">
          <span className="weekly-week-of">WEEK OF {getWeekRange(weekId)}</span>
          {isCurrentWeek && <span style={{ fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>CURRENT</span>}
        </div>
        <div style={{ marginTop: 8 }}>
          <input
            className="weekly-focus-input"
            placeholder="WEEKLY FOCUS"
            value={weeklyFocus}
            onChange={(e) => handleFocusChange(e.target.value)}
            style={{ maxWidth: 500 }}
          />
        </div>
      </div>

      <div className="weekly-content">
        <div className="left-column">
          <PriorityPanel type="top" title="TOP PRIORITY" className="top" weekId={weekId} />
          <PriorityPanel type="low" title="LOW PRIORITY" className="low" weekId={weekId} />
          <PriorityPanel type="follow-up" title="FOLLOW UP" className="follow-up" weekId={weekId} />
        </div>

        <div className="center-column">
          <TodoList weekId={weekId} />
          <NotesPanel weekId={weekId} />
        </div>

        <div className="right-column">
          <HabitTracker weekId={weekId} />
          <DayScheduleGrid weekId={weekId} />
        </div>
      </div>
    </div>
  );
}
