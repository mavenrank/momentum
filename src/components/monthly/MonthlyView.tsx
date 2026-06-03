import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isToday } from 'date-fns';
import { useTaskStore } from '../../store/useTaskStore';

export function MonthlyView() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const tasks = useTaskStore((s) => s.tasks);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  let d = calStart;
  while (d <= calEnd) {
    days.push(d);
    d = addDays(d, 1);
  }

  function prevMonth() { setCurrentMonth(subMonths(currentMonth, 1)); }
  function nextMonth() { setCurrentMonth(addMonths(currentMonth, 1)); }

  function getTasksForDate(date: Date) {
    const dateStr = date.toISOString().split('T')[0];
    return tasks.filter((t) => t.date === dateStr);
  }

  return (
    <div className="monthly-view">
      <div className="monthly-header">
        <h1 className="monthly-title">Monthly View</h1>
        <div className="monthly-nav">
          <button className="monthly-nav-btn" onClick={prevMonth}><ChevronLeft size={18} /></button>
          <span className="monthly-label">{format(currentMonth, 'MMMM yyyy')}</span>
          <button className="monthly-nav-btn" onClick={nextMonth}><ChevronRight size={18} /></button>
        </div>
      </div>

      <div className="monthly-calendar">
        <div className="monthly-calendar-header">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
            <div key={day} className="monthly-calendar-header-cell">{day}</div>
          ))}
        </div>
        <div className="monthly-calendar-grid">
          {days.map((day) => {
            const dayTasks = getTasksForDate(day);
            return (
              <div
                key={day.toISOString()}
                className={`monthly-calendar-cell${!isSameMonth(day, currentMonth) ? ' other-month' : ''}${isToday(day) ? ' today' : ''}`}
              >
                <div className="monthly-calendar-day">{format(day, 'd')}</div>
                {dayTasks.slice(0, 2).map((task) => (
                  <div
                    key={task.id}
                    style={{
                      fontSize: 10,
                      padding: '1px 4px',
                      marginBottom: 1,
                      borderRadius: 2,
                      background: task.done ? 'var(--green-bg)' : 'var(--bg-secondary)',
                      textDecoration: task.done ? 'line-through' : 'none',
                      color: 'var(--text-secondary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {task.text}
                  </div>
                ))}
                {dayTasks.length > 2 && (
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                    +{dayTasks.length - 2} more
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
