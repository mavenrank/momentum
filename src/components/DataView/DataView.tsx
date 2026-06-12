import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { validateImport } from "../../lib/plannerData";
import type { PlannerData } from "../../types/planner";
import "./DataView.css";

interface DataViewProps {
  data: PlannerData;
  replaceData: (data: PlannerData) => void;
}

export function DataView({ data, replaceData }: DataViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `momentum-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importData(file: File | undefined) {
    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const validated = validateImport(parsed);
      if (!validated) {
        setMessage("That file does not look like a Momentum backup.");
        return;
      }
      replaceData(validated);
      setMessage("Backup imported.");
    } catch {
      setMessage("Could not read that JSON file.");
    }
  }

  return (
    <>
      <header className="view-header">
        <div>
          <h2>Data</h2>
        </div>
      </header>

      <div className="panel-grid data-grid">
        <section className="planner-panel data-action-panel">
          <h3>Portable Backup</h3>
          <div className="data-actions">
            <button className="primary-button" type="button" onClick={exportData}>
              <Download size={17} />
              Export JSON
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={17} />
              Import JSON
            </button>
            <input
              accept="application/json"
              hidden
              ref={fileInputRef}
              type="file"
              onChange={(event) => importData(event.target.files?.[0])}
            />
          </div>
          {message ? <p className="data-message">{message}</p> : null}
        </section>

        <section className="planner-panel data-summary-panel">
          <h3>Current Data</h3>
          <dl className="data-summary">
            <div>
              <dt>Daily entries</dt>
              <dd>{Object.keys(data.daily).length}</dd>
            </div>
            <div>
              <dt>Weekly entries</dt>
              <dd>{Object.keys(data.weekly).length}</dd>
            </div>
            <div>
              <dt>Active habits</dt>
              <dd>{data.habits.filter((habit) => !habit.archived).length}</dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd>{new Date(data.updatedAt).toLocaleString()}</dd>
            </div>
          </dl>
        </section>
      </div>
    </>
  );
}
