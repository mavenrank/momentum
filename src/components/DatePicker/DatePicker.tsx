import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, formatFriendlyDate, toDateKey } from "../../lib/date";
import "./DatePicker.css";

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
}

export function DatePicker({ value, onChange }: DatePickerProps) {
  return (
    <div className="date-picker">
      <button
        className="icon-button"
        type="button"
        title="Previous day"
        onClick={() => onChange(addDays(value, -1))}
      >
        <ChevronLeft size={18} />
      </button>
      <label className="date-picker-input">
        <span>{formatFriendlyDate(value)}</span>
        <input
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <button
        className="icon-button"
        type="button"
        title="Next day"
        onClick={() => onChange(addDays(value, 1))}
      >
        <ChevronRight size={18} />
      </button>
      <button className="ghost-button" type="button" onClick={() => onChange(toDateKey(new Date()))}>
        Today
      </button>
    </div>
  );
}
