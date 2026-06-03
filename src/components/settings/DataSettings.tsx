import { useRef } from 'react';
import { Download, Upload, Trash2 } from 'lucide-react';
import { exportAllData, importData } from '../../utils/export';
import { clearAllData, getStoreSize } from '../../utils/storage';

export function DataSettings() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleImport() {
    fileInputRef.current?.click();
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await importData(file);
      if (data.tasks) localStorage.setItem('momentum-tasks', JSON.stringify(data.tasks));
      if (data.habits) localStorage.setItem('momentum-habits', JSON.stringify(data.habits));
      if (data.habitTracking) localStorage.setItem('momentum-habit-tracking', JSON.stringify(data.habitTracking));
      if (data.notes) localStorage.setItem('momentum-notes', JSON.stringify(data.notes));
      if (data.goals) localStorage.setItem('momentum-goals', JSON.stringify(data.goals));
      if (data.weeklyPlans) localStorage.setItem('momentum-weekly-plans', JSON.stringify(data.weeklyPlans));
      window.location.reload();
    } catch (err) {
      alert('Failed to import: ' + (err as Error).message);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClear() {
    if (confirm('Are you sure you want to delete ALL data? This cannot be undone.')) {
      clearAllData();
      window.location.reload();
    }
  }

  return (
    <div className="data-settings">
      <h1 className="data-settings-title">Settings</h1>

      <div className="data-settings-section">
        <div className="data-settings-section-title">Data Storage</div>
        <div className="data-settings-desc">
          All data is stored in your browser's local storage. Current size: {getStoreSize()}
        </div>
        <div className="data-settings-desc" style={{ fontSize: 12 }}>
          To move data to another device, export to a JSON file, copy it over, then import on the other device.
        </div>
      </div>

      <div className="data-settings-section">
        <div className="data-settings-section-title">Export / Import</div>
        <div className="data-settings-desc">
          Export all your data as a JSON file, or import data from a previous export.
        </div>
        <div className="data-settings-actions">
          <button className="btn btn-sm" onClick={exportAllData}>
            <Download size={14} /> Export
          </button>
          <button className="btn btn-sm" onClick={handleImport}>
            <Upload size={14} /> Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </div>
      </div>

      <div className="data-settings-section">
        <div className="data-settings-section-title">Danger Zone</div>
        <div className="data-settings-desc">
          Permanently delete all data. Make sure you've exported first!
        </div>
        <button className="btn btn-danger btn-sm" onClick={handleClear}>
          <Trash2 size={14} /> Delete All Data
        </button>
      </div>
    </div>
  );
}
