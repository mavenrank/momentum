import type { Dispatch, SetStateAction } from "react";
import { DatePicker } from "../DatePicker/DatePicker";
import { ensureDaily } from "../../lib/plannerData";
import type { PlannerData } from "../../types/planner";
import "./NotesView.css";

interface JournalViewProps {
  data: PlannerData;
  setData: Dispatch<SetStateAction<PlannerData>>;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
}

export function JournalView({ data, setData, selectedDate, setSelectedDate }: JournalViewProps) {
  const entry = ensureDaily(data, selectedDate);
  const recentNotes = Object.values(data.daily)
    .filter((daily) => daily.note.trim())
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  return (
    <>
      <header className="view-header">
        <div>
          <h2>Journal</h2>
        </div>
        <DatePicker value={selectedDate} onChange={setSelectedDate} />
      </header>

      <div className="panel-grid notes-grid">
        <section className="planner-panel note-writing-panel">
          <h3>{selectedDate}</h3>
          <textarea
            className="text-area note-editor"
            value={entry.note}
            onChange={(event) =>
              setData((current) => ({
                ...current,
                daily: {
                  ...current.daily,
                  [selectedDate]: { ...entry, note: event.target.value },
                },
              }))
            }
            placeholder="Write the day as it actually felt."
          />
        </section>

        <section className="planner-panel recent-notes-panel">
          <h3>Recent Entries</h3>
          <div className="recent-note-list">
            {recentNotes.length === 0 ? (
              <p className="empty-state">Your recent journal entries will appear here.</p>
            ) : null}
            {recentNotes.map((note) => (
              <button
                className="recent-note"
                key={note.date}
                type="button"
                onClick={() => setSelectedDate(note.date)}
              >
                <strong>{note.date}</strong>
                <span>{note.note.slice(0, 140)}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
