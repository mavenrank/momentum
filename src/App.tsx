import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { DailyView } from './components/daily/DailyView';
import { WeeklyView } from './components/weekly/WeeklyView';
import { MonthlyView } from './components/monthly/MonthlyView';
import { GoalsView } from './components/goals/GoalsView';
import { DataSettings } from './components/settings/DataSettings';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/weekly" replace />} />
          <Route path="/daily" element={<DailyView />} />
          <Route path="/weekly" element={<WeeklyView />} />
          <Route path="/monthly" element={<MonthlyView />} />
          <Route path="/goals" element={<GoalsView />} />
          <Route path="/settings" element={<DataSettings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
