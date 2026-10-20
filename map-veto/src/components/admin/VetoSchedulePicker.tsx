'use client';

import { useId, useRef } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  matchLabel: string;
}

/** Calendar + explicit 24-hour time, stored as a GMT+3 wall-clock value. */
export function VetoSchedulePicker({ value, onChange, disabled, matchLabel }: Props) {
  const id = useId();
  const dateInput = useRef<HTMLInputElement>(null);
  const [date = '', time = ''] = value.split('T');
  function update(nextDate: string, nextTime: string) {
    onChange(!nextDate && !nextTime ? '' : `${nextDate}T${nextTime}`);
  }
  function openCalendar() {
    if (!dateInput.current || disabled) return;
    try { dateInput.current.showPicker(); } catch { dateInput.current.focus(); }
  }
  return <fieldset disabled={disabled} className="space-y-2 min-w-64">
    <legend className="sr-only">MapVETO time {matchLabel} GMT+3</legend>
    <label htmlFor={`${id}-date`} className="block text-xs text-white/70">Date</label>
    <div className="flex gap-2">
      <input ref={dateInput} id={`${id}-date`} type="date" min="2000-01-01" max="2100-12-31"
        className="match-input min-h-11 flex-1 [color-scheme:dark]" value={date}
        onChange={event => update(event.target.value, time)} />
      <button type="button" onClick={openCalendar} className="btn-secondary min-h-11 px-3 text-xs"
        aria-label={`Open calendar for ${matchLabel}`} aria-controls={`${id}-date`}>Calendar</button>
    </div>
    <label htmlFor={`${id}-time`} className="block text-xs text-white/70">Time · GMT+3</label>
    <input id={`${id}-time`} type="time" step={60} className="match-input min-h-11 [color-scheme:dark]"
      value={time} onChange={event => update(date, event.target.value)} />
    {date && time ? <p className="text-xs text-white/70">{date} {time} GMT+3</p> : null}
  </fieldset>;
}
