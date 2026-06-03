import { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { useGoalStore } from '../../store/useGoalStore';
import { useHabitStore } from '../../store/useHabitStore';

export function GoalsView() {
  const goals = useGoalStore((s) => s.goals);
  const addGoal = useGoalStore((s) => s.addGoal);
  const deleteGoal = useGoalStore((s) => s.deleteGoal);

  const habits = useHabitStore((s) => s.habits);
  const addHabit = useHabitStore((s) => s.addHabit);
  const deleteHabit = useHabitStore((s) => s.deleteHabit);

  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDesc, setGoalDesc] = useState('');
  const [goalDeadline, setGoalDeadline] = useState('');

  const [habitName, setHabitName] = useState('');
  const [habitGoal, setHabitGoal] = useState('');

  function handleAddGoal() {
    if (!goalTitle.trim()) return;
    addGoal({
      title: goalTitle.trim(),
      description: goalDesc.trim(),
      deadline: goalDeadline || undefined,
      progress: 0,
    });
    setGoalTitle('');
    setGoalDesc('');
    setGoalDeadline('');
    setShowGoalForm(false);
  }

  function handleAddHabit() {
    if (!habitName.trim()) return;
    addHabit(habitName.trim(), habitGoal.trim() || 'Daily');
    setHabitName('');
    setHabitGoal('');
  }

  return (
    <div className="goals-view">
      <div className="goals-header">
        <h1 className="goals-title">Goals & Habits</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setShowGoalForm(true)}>
          <Plus size={14} /> New Goal
        </button>
      </div>

      {showGoalForm && (
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 20 }}>
          <div className="form-group">
            <label className="form-label">Title</label>
            <input className="form-input" value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} placeholder="What do you want to achieve?" />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <input className="form-input" value={goalDesc} onChange={(e) => setGoalDesc(e.target.value)} placeholder="Optional details..." />
          </div>
          <div className="form-group">
            <label className="form-label">Deadline (optional)</label>
            <input type="date" className="form-input" value={goalDeadline} onChange={(e) => setGoalDeadline(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleAddGoal}>Save Goal</button>
            <button className="btn btn-sm" onClick={() => setShowGoalForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="goals-grid">
        {goals.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
            No goals yet. Set your first goal!
          </div>
        )}
        {goals.map((goal) => (
          <div key={goal.id} className={`goal-card${goal.deadline ? ' deadline' : ''}`}>
            <div className="goal-card-header">
              <div>
                <div className="goal-card-title">{goal.title}</div>
                {goal.description && <div className="goal-card-desc">{goal.description}</div>}
                {goal.deadline && (
                  <div style={{ fontSize: 11, color: 'var(--orange)', marginTop: 4 }}>
                    Due: {new Date(goal.deadline).toLocaleDateString()}
                  </div>
                )}
              </div>
              <div className="goal-card-actions">
                <button className="btn btn-sm" onClick={() => deleteGoal(goal.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div className="goal-card-progress">
              <div className="goal-progress-bar-bg">
                <div className="goal-progress-bar-fill" style={{ width: `${goal.progress}%` }} />
              </div>
              <div className="goal-progress-label">{goal.progress}%</div>
            </div>
          </div>
        ))}
      </div>

      <div className="habits-manager">
        <h2 className="habits-manager-title">Habits</h2>

        <div className="add-habit-form">
          <input
            placeholder="Habit name"
            value={habitName}
            onChange={(e) => setHabitName(e.target.value)}
          />
          <input
            placeholder="Goal (e.g. Daily)"
            value={habitGoal}
            onChange={(e) => setHabitGoal(e.target.value)}
            style={{ maxWidth: 160 }}
          />
          <button className="btn btn-primary btn-sm" onClick={handleAddHabit}>
            <Plus size={14} /> Add
          </button>
        </div>

        {habits.map((habit) => (
          <div key={habit.id} className="habit-manager-item">
            <div className="habit-manager-info">
              <div className="habit-manager-name">{habit.name}</div>
              <div className="habit-manager-goal">{habit.goal}</div>
            </div>
            <div className="habit-manager-actions">
              <button className="btn btn-sm" onClick={() => deleteHabit(habit.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}

        {habits.length === 0 && (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)', fontSize: 13 }}>
            No habits yet. Add one to start tracking!
          </div>
        )}
      </div>
    </div>
  );
}
