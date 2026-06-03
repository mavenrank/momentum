import { useState } from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useTaskStore } from '../../store/useTaskStore';
import { useNoteStore } from '../../store/useNoteStore';
import { useHabitStore } from '../../store/useHabitStore';
import { getTodayISO, formatDate, getWeekId } from '../../utils/date';

export function DailyView() {
  const [currentDate, setCurrentDate] = useState(getTodayISO());
  const [newTaskText, setNewTaskText] = useState('');

  const tasks = useTaskStore((s) => s.tasks);
  const addTask = useTaskStore((s) => s.addTask);
  const toggleTask = useTaskStore((s) => s.toggleTask);

  const notes = useNoteStore((s) => s.notes);
  const upsertNote = useNoteStore((s) => s.upsertNote);

  const habits = useHabitStore((s) => s.habits);
  const toggleTracking = useHabitStore((s) => s.toggleTracking);
  const isTracked = useHabitStore((s) => s.isTracked);

  const dayTasks = tasks.filter((t) => t.date === currentDate);
  const dayNote = notes.find((n) => n.date === currentDate && n.type === 'daily');

  function prevDay() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 1);
    setCurrentDate(d.toISOString().split('T')[0]);
  }

  function nextDay() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    setCurrentDate(d.toISOString().split('T')[0]);
  }

  function goToday() {
    setCurrentDate(getTodayISO());
  }

  function handleAddTask() {
    const text = newTaskText.trim();
    if (!text) return;
    addTask({
      text,
      done: false,
      priority: 'todo',
      date: currentDate,
      weekId: getWeekId(new Date(currentDate)),
    });
    setNewTaskText('');
  }

  function handleNoteChange(content: string) {
    upsertNote(currentDate, 'daily', content);
  }

  const isToday = currentDate === getTodayISO();

  return (
    <div className="daily-view">
      <div className="daily-header">
        <h1 className="daily-title">{isToday ? 'Today' : formatDate(currentDate, 'EEEE')}</h1>
        <div className="daily-nav">
          <button className="daily-nav-btn" onClick={prevDay}><ChevronLeft size={16} /></button>
          <button className="daily-nav-btn" style={{ fontWeight: 500, padding: '0 8px', fontSize: 12 }} onClick={goToday}>
            Today
          </button>
          <span className="daily-date-label">{formatDate(currentDate, 'MMM d, yyyy')}</span>
          <button className="daily-nav-btn" onClick={nextDay}><ChevronRight size={16} /></button>
        </div>
      </div>

      <div className="daily-grid">
        <div className="daily-section">
          <div className="daily-section-header">Tasks</div>
          <div className="daily-tasks">
            {dayTasks.map((task) => (
              <div
                key={task.id}
                className={`daily-task${task.done ? ' done' : ''}`}
                onClick={() => toggleTask(task.id)}
              >
                <div className="daily-task-checkbox">
                  {task.done && <Check size={10} />}
                </div>
                <span className="daily-task-text">{task.text}</span>
              </div>
            ))}
          </div>
          <div className="daily-add-task">
            <input
              className="daily-add-task-input"
              placeholder="Add a task..."
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
            />
          </div>
        </div>

        <div className="daily-section">
          <div className="daily-section-header">Habits</div>
          <div className="daily-habits">
            {habits.length === 0 && (
              <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                No habits yet. Add them in Goals & Habits.
              </div>
            )}
            {habits.map((habit) => {
              const done = isTracked(habit.id, currentDate);
              return (
                <div
                  key={habit.id}
                  className={`daily-habit-item${done ? ' done' : ''}`}
                  onClick={() => toggleTracking(habit.id, currentDate)}
                >
                  <div className="daily-habit-checkbox">
                    {done && <Check size={10} />}
                  </div>
                  <span className="daily-task-text">{habit.name}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="daily-section full">
          <div className="daily-section-header">Journal</div>
          <textarea
            className="daily-note-textarea"
            placeholder="What happened today? How are you feeling? What did you learn?"
            value={dayNote?.content ?? ''}
            onChange={(e) => handleNoteChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
