'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  SLOTS_PER_DAY,
  SLOT_MINUTES,
  dateKey,
  overlaps,
  slotToTime,
  toMinutes,
  type ShiftOccurrence,
} from '@/lib/scheduling';

export interface StaffInfo {
  name: string;
  role?: string;
}

export interface NewShiftRange {
  dateKey: string;
  startTime: string;
  endTime: string;
}

export interface ScheduleCalendarProps {
  view: 'week' | 'month';
  days: Date[];
  /** Month being displayed (month view dims days outside it). */
  anchor: Date;
  occurrences: ShiftOccurrence[];
  staffById: Map<string, StaffInfo>;
  canEdit: boolean;
  onCreate: (range: NewShiftRange) => void;
  onResize: (occurrence: ShiftOccurrence, endTime: string) => void;
  onOpen: (occurrence: ShiftOccurrence) => void;
}

const SLOT_HEIGHT = 20; // px per 30-minute slot
const DAY_START_SLOT = 14; // scroll to 07:00 initially
const DEFAULT_SHIFT = { start: '09:00', end: '17:00' };
const MONTH_KEY_DELTA: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

const ROLE_COLORS: Record<string, string> = {
  DOCTOR: 'bg-blue-100 border-blue-400 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100',
  NURSE: 'bg-green-100 border-green-400 text-green-900 dark:bg-green-900/40 dark:text-green-100',
  ASSISTANT:
    'bg-purple-100 border-purple-400 text-purple-900 dark:bg-purple-900/40 dark:text-purple-100',
};
const DEFAULT_COLOR =
  'bg-neutral-100 border-neutral-400 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100';
const UNAVAILABLE_COLOR =
  'bg-neutral-100 border-dashed border-neutral-400 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300';

function shiftColor(occ: ShiftOccurrence, staff?: StaffInfo) {
  if (!occ.schedule.isAvailable) return UNAVAILABLE_COLOR;
  return (staff?.role && ROLE_COLORS[staff.role]) || DEFAULT_COLOR;
}

function formatDay(day: Date, opts: Intl.DateTimeFormatOptions) {
  return day.toLocaleDateString(undefined, opts);
}

/** Occurrences overlapping another shift for the same person on the same day. */
function conflictingKeys(occurrences: ShiftOccurrence[]): Set<string> {
  const keys = new Set<string>();
  for (let i = 0; i < occurrences.length; i++) {
    for (let j = i + 1; j < occurrences.length; j++) {
      const a = occurrences[i];
      const b = occurrences[j];
      if (
        a.dateKey === b.dateKey &&
        a.schedule.userId === b.schedule.userId &&
        overlaps(a.startTime, a.endTime, b.startTime, b.endTime)
      ) {
        keys.add(a.key);
        keys.add(b.key);
      }
    }
  }
  return keys;
}

/** Greedy lane assignment so overlapping shifts sit side by side. */
function layoutLanes(occs: ShiftOccurrence[]) {
  const lanesEnd: number[] = [];
  const placed = occs.map((occ) => {
    const start = toMinutes(occ.startTime);
    let lane = lanesEnd.findIndex((end) => end <= start);
    if (lane === -1) lane = lanesEnd.length;
    lanesEnd[lane] = toMinutes(occ.endTime);
    return { occ, lane };
  });
  return { placed, lanes: Math.max(1, lanesEnd.length) };
}

type Drag =
  | { type: 'create'; day: number; from: number; to: number; column: HTMLElement }
  | { type: 'resize'; day: number; occ: ShiftOccurrence; endSlot: number; column: HTMLElement };

function slotFromPointer(column: HTMLElement, clientY: number, round = false) {
  const y = clientY - column.getBoundingClientRect().top;
  const raw = y / SLOT_HEIGHT;
  return Math.max(0, Math.min(SLOTS_PER_DAY, round ? Math.round(raw) : Math.floor(raw)));
}

// ── Week view ───────────────────────────────────────────────────────────────

function WeekView({
  days,
  occurrences,
  staffById,
  canEdit,
  onCreate,
  onResize,
  onOpen,
}: ScheduleCalendarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const todayIndex = Math.max(
    0,
    days.findIndex((d) => dateKey(d) === dateKey(new Date()))
  );
  const [cursor, setCursor] = useState({ day: todayIndex, slot: 18, anchorSlot: 18 });
  const [focused, setFocused] = useState(false);

  const conflicts = useMemo(() => conflictingKeys(occurrences), [occurrences]);
  const byDay = useMemo(
    () => days.map((d) => layoutLanes(occurrences.filter((o) => o.dateKey === dateKey(d)))),
    [days, occurrences]
  );

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = DAY_START_SLOT * SLOT_HEIGHT;
  }, []);

  // Keep the keyboard selection visible
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = Math.min(cursor.slot, cursor.anchorSlot) * SLOT_HEIGHT;
    const bottom = (Math.max(cursor.slot, cursor.anchorSlot) + 1) * SLOT_HEIGHT;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
  }, [cursor]);

  const selFrom = Math.min(cursor.slot, cursor.anchorSlot);
  const selTo = Math.max(cursor.slot, cursor.anchorSlot) + 1;
  const selectionLabel = `${formatDay(days[cursor.day], { weekday: 'long', month: 'short', day: 'numeric' })}, ${slotToTime(selFrom)} to ${slotToTime(selTo)}`;

  const onKeyDown = (e: React.KeyboardEvent) => {
    const move = (day: number, slot: number) => {
      const nextDay = Math.max(0, Math.min(days.length - 1, day));
      const nextSlot = Math.max(0, Math.min(SLOTS_PER_DAY - 1, slot));
      setCursor((c) => ({
        day: nextDay,
        slot: nextSlot,
        anchorSlot: e.shiftKey && nextDay === c.day ? c.anchorSlot : nextSlot,
      }));
    };
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        move(cursor.day, cursor.slot - 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        move(cursor.day, cursor.slot + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        move(cursor.day - 1, cursor.slot);
        break;
      case 'ArrowRight':
        e.preventDefault();
        move(cursor.day + 1, cursor.slot);
        break;
      case 'Home':
        e.preventDefault();
        move(cursor.day, 0);
        break;
      case 'End':
        e.preventDefault();
        move(cursor.day, SLOTS_PER_DAY - 1);
        break;
      case 'Escape':
        setCursor((c) => ({ ...c, anchorSlot: c.slot }));
        break;
      case 'Enter':
      case ' ':
        if (!canEdit) return;
        e.preventDefault();
        onCreate({
          dateKey: dateKey(days[cursor.day]),
          startTime: slotToTime(selFrom),
          endTime: slotToTime(selTo),
        });
        break;
    }
  };

  const startCreate = (e: React.PointerEvent<HTMLDivElement>, day: number) => {
    if (!canEdit || e.button !== 0 || e.target !== e.currentTarget) return;
    const column = e.currentTarget;
    column.setPointerCapture(e.pointerId);
    const slot = Math.min(SLOTS_PER_DAY - 1, slotFromPointer(column, e.clientY));
    setDrag({ type: 'create', day, from: slot, to: slot, column });
    setCursor({ day, slot, anchorSlot: slot });
  };

  const startResize = (
    e: React.PointerEvent<HTMLDivElement>,
    day: number,
    occ: ShiftOccurrence
  ) => {
    if (!canEdit || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const column = (e.currentTarget.closest('[data-day-col]') as HTMLElement) ?? e.currentTarget;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      type: 'resize',
      day,
      occ,
      endSlot: Math.ceil(toMinutes(occ.endTime) / SLOT_MINUTES),
      column,
    });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    if (drag.type === 'create') {
      const slot = Math.min(SLOTS_PER_DAY - 1, slotFromPointer(drag.column, e.clientY));
      if (slot !== drag.to) setDrag({ ...drag, to: slot });
    } else {
      const startSlot = Math.floor(toMinutes(drag.occ.startTime) / SLOT_MINUTES);
      const endSlot = Math.max(startSlot + 1, slotFromPointer(drag.column, e.clientY, true));
      if (endSlot !== drag.endSlot) setDrag({ ...drag, endSlot });
    }
  };

  const onPointerUp = () => {
    if (!drag) return;
    if (drag.type === 'create') {
      const from = Math.min(drag.from, drag.to);
      const to = Math.max(drag.from, drag.to) + 1;
      // A plain click (no drag) proposes a one-hour shift
      const end = to - from === 1 ? Math.min(SLOTS_PER_DAY, from + 2) : to;
      setCursor({ day: drag.day, slot: end - 1, anchorSlot: from });
      onCreate({
        dateKey: dateKey(days[drag.day]),
        startTime: slotToTime(from),
        endTime: slotToTime(end),
      });
    } else {
      const endTime = slotToTime(drag.endSlot);
      if (endTime !== drag.occ.endTime) onResize(drag.occ, endTime);
    }
    setDrag(null);
  };

  const totalHeight = SLOTS_PER_DAY * SLOT_HEIGHT;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
      <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-neutral-200 dark:border-neutral-700">
        <div />
        {days.map((d) => {
          const isToday = dateKey(d) === dateKey(new Date());
          return (
            <div
              key={dateKey(d)}
              className={[
                'px-2 py-2 text-center text-xs font-semibold',
                isToday ? 'text-primary-600' : 'text-neutral-600 dark:text-neutral-300',
              ].join(' ')}
            >
              {formatDay(d, { weekday: 'short' })}
              <span className="ml-1 font-normal">
                {formatDay(d, { month: 'short', day: 'numeric' })}
              </span>
            </div>
          );
        })}
      </div>

      <div
        ref={scrollRef}
        role="grid"
        aria-label="Weekly schedule. Use arrow keys to move, Shift+arrow to extend, Enter to create a shift."
        aria-readonly={!canEdit}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="focus-visible:ring-primary-500 relative h-[65vh] overflow-y-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-inset"
      >
        <p className="sr-only" aria-live="polite">
          Selected {selectionLabel}
        </p>
        <div
          className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]"
          style={{ height: totalHeight }}
        >
          {/* Hour gutter */}
          <div className="relative" aria-hidden="true">
            {Array.from({ length: 24 }, (_, h) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[10px] text-neutral-400"
                style={{ top: h * 2 * SLOT_HEIGHT }}
              >
                {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </span>
            ))}
          </div>

          {days.map((day, dayIndex) => {
            const { placed, lanes } = byDay[dayIndex];
            const creating = drag?.type === 'create' && drag.day === dayIndex ? drag : null;
            const keyboardSel = focused && !drag && cursor.day === dayIndex;
            const selFromSlot = creating ? Math.min(creating.from, creating.to) : selFrom;
            const selToSlot = creating ? Math.max(creating.from, creating.to) + 1 : selTo;

            return (
              <div
                key={dateKey(day)}
                data-day-col
                role="gridcell"
                aria-selected={cursor.day === dayIndex}
                onPointerDown={(e) => startCreate(e, dayIndex)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setDrag(null)}
                className={[
                  'relative touch-none border-l border-neutral-100 dark:border-neutral-700',
                  canEdit ? 'cursor-crosshair' : '',
                ].join(' ')}
                style={{
                  backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${2 * SLOT_HEIGHT - 1}px, rgb(229 231 235 / 0.8) ${2 * SLOT_HEIGHT - 1}px, rgb(229 231 235 / 0.8) ${2 * SLOT_HEIGHT}px)`,
                }}
              >
                {(creating || keyboardSel) && (
                  <div
                    aria-hidden="true"
                    className="border-primary-500 bg-primary-100/60 dark:bg-primary-900/40 pointer-events-none absolute inset-x-0.5 rounded border-2 border-dashed"
                    style={{
                      top: selFromSlot * SLOT_HEIGHT,
                      height: (selToSlot - selFromSlot) * SLOT_HEIGHT,
                    }}
                  >
                    <span className="text-primary-700 dark:text-primary-200 px-1 text-[10px] font-medium">
                      {slotToTime(selFromSlot)}–{slotToTime(selToSlot)}
                    </span>
                  </div>
                )}

                {placed.map(({ occ, lane }) => {
                  const staff = staffById.get(occ.schedule.userId);
                  const resizing =
                    drag?.type === 'resize' && drag.occ.key === occ.key ? drag : null;
                  const start = toMinutes(occ.startTime);
                  const end = resizing ? resizing.endSlot * SLOT_MINUTES : toMinutes(occ.endTime);
                  const conflict = conflicts.has(occ.key);
                  return (
                    <div
                      key={occ.key}
                      className={[
                        'absolute overflow-hidden rounded border-l-4 text-[11px] shadow-sm',
                        shiftColor(occ, staff),
                        conflict ? 'ring-danger-500 ring-2' : '',
                        resizing ? 'opacity-80' : '',
                      ].join(' ')}
                      style={{
                        top: (start / SLOT_MINUTES) * SLOT_HEIGHT,
                        height: Math.max(SLOT_HEIGHT, ((end - start) / SLOT_MINUTES) * SLOT_HEIGHT),
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => onOpen(occ)}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="block h-full w-full px-1 py-0.5 text-left focus:outline-none focus-visible:underline"
                        aria-label={`${staff?.name ?? 'Staff'} ${occ.startTime} to ${occ.endTime}${occ.schedule.isAvailable ? '' : ', unavailable'}${conflict ? ', conflicts with another shift' : ''}`}
                      >
                        <span className="block truncate font-semibold">
                          {staff?.name ?? 'Staff'}
                        </span>
                        <span className="block truncate">
                          {occ.startTime}–{resizing ? slotToTime(resizing.endSlot) : occ.endTime}
                          {!occ.schedule.isAvailable && ' · off'}
                        </span>
                      </button>
                      {canEdit && (
                        <div
                          aria-hidden="true"
                          onPointerDown={(e) => startResize(e, dayIndex, occ)}
                          // Captured on the handle; stop bubbling so the column doesn't handle it twice
                          onPointerMove={(e) => {
                            e.stopPropagation();
                            onPointerMove(e);
                          }}
                          onPointerUp={(e) => {
                            e.stopPropagation();
                            onPointerUp();
                          }}
                          className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize touch-none bg-black/5 hover:bg-black/20"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Month view ──────────────────────────────────────────────────────────────

function MonthView({
  days,
  anchor,
  occurrences,
  staffById,
  canEdit,
  onCreate,
  onOpen,
}: ScheduleCalendarProps) {
  const todayIndex = days.findIndex((d) => dateKey(d) === dateKey(new Date()));
  const firstOfMonth = days.findIndex((d) => d.getMonth() === anchor.getMonth());
  const [cursor, setCursor] = useState(
    todayIndex >= 0 && days[todayIndex].getMonth() === anchor.getMonth() ? todayIndex : firstOfMonth
  );
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const conflicts = useMemo(() => conflictingKeys(occurrences), [occurrences]);

  useEffect(() => {
    if (gridRef.current?.contains(document.activeElement)) cellRefs.current[cursor]?.focus();
  }, [cursor]);

  const createOn = (day: Date) =>
    canEdit &&
    onCreate({ dateKey: dateKey(day), startTime: DEFAULT_SHIFT.start, endTime: DEFAULT_SHIFT.end });

  const onKeyDown = (e: React.KeyboardEvent) => {
    const delta = MONTH_KEY_DELTA[e.key];
    if (delta !== undefined) {
      e.preventDefault();
      setCursor((c) => Math.max(0, Math.min(days.length - 1, c + delta)));
    } else if ((e.key === 'Enter' || e.key === ' ') && e.target === cellRefs.current[cursor]) {
      e.preventDefault();
      createOn(days[cursor]);
    }
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
      <div className="grid grid-cols-7 border-b border-neutral-200 text-center text-xs font-semibold text-neutral-500 dark:border-neutral-700">
        {days.slice(0, 7).map((d) => (
          <div key={d.getDay()} className="py-2">
            {formatDay(d, { weekday: 'short' })}
          </div>
        ))}
      </div>
      <div
        ref={gridRef}
        role="grid"
        aria-label="Monthly schedule. Use arrow keys to move between days, Enter to add a shift."
        onKeyDown={onKeyDown}
        className="grid grid-cols-7"
      >
        {days.map((day, i) => {
          const key = dateKey(day);
          const dayOccs = occurrences.filter((o) => o.dateKey === key);
          const inMonth = day.getMonth() === anchor.getMonth();
          return (
            <div
              key={key}
              ref={(el) => {
                cellRefs.current[i] = el;
              }}
              role="gridcell"
              tabIndex={i === cursor ? 0 : -1}
              aria-selected={i === cursor}
              aria-label={`${formatDay(day, { weekday: 'long', month: 'long', day: 'numeric' })}, ${dayOccs.length} shift${dayOccs.length === 1 ? '' : 's'}`}
              onFocus={() => setCursor(i)}
              onDoubleClick={() => createOn(day)}
              className={[
                'focus-visible:ring-primary-500 min-h-28 border-t border-l border-neutral-100 p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset dark:border-neutral-700',
                inMonth ? '' : 'bg-neutral-50 text-neutral-400 dark:bg-neutral-900',
                i === cursor ? 'bg-primary-50/60 dark:bg-primary-900/20' : '',
              ].join(' ')}
            >
              <div className="flex items-center justify-between">
                <span
                  className={[
                    'text-xs font-semibold',
                    key === dateKey(new Date()) ? 'text-primary-600' : '',
                  ].join(' ')}
                >
                  {day.getDate()}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => createOn(day)}
                    className="rounded px-1 text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-700"
                    aria-label={`Add shift on ${formatDay(day, { month: 'long', day: 'numeric' })}`}
                  >
                    +
                  </button>
                )}
              </div>
              <ul className="mt-1 space-y-0.5">
                {dayOccs.slice(0, 4).map((occ) => {
                  const staff = staffById.get(occ.schedule.userId);
                  return (
                    <li key={occ.key}>
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => onOpen(occ)}
                        className={[
                          'block w-full truncate rounded border-l-2 px-1 text-left text-[10px]',
                          shiftColor(occ, staff),
                          conflicts.has(occ.key) ? 'ring-danger-500 ring-1' : '',
                        ].join(' ')}
                      >
                        {occ.startTime} {staff?.name ?? 'Staff'}
                      </button>
                    </li>
                  );
                })}
                {dayOccs.length > 4 && (
                  <li className="px-1 text-[10px] text-neutral-500">+{dayOccs.length - 4} more</li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Mobile agenda ───────────────────────────────────────────────────────────

export function ScheduleAgenda({
  days,
  occurrences,
  staffById,
  canEdit,
  onCreate,
  onOpen,
}: Pick<
  ScheduleCalendarProps,
  'days' | 'occurrences' | 'staffById' | 'canEdit' | 'onCreate' | 'onOpen'
>) {
  const conflicts = useMemo(() => conflictingKeys(occurrences), [occurrences]);
  const daysWithShifts = days.filter(
    (d) => occurrences.some((o) => o.dateKey === dateKey(d)) || dateKey(d) === dateKey(new Date())
  );

  if (daysWithShifts.length === 0) {
    return <p className="py-10 text-center text-sm text-neutral-500">No shifts in this period.</p>;
  }

  return (
    <ol className="space-y-4">
      {daysWithShifts.map((day) => {
        const key = dateKey(day);
        const dayOccs = occurrences.filter((o) => o.dateKey === key);
        return (
          <li key={key}>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
                {formatDay(day, { weekday: 'long', month: 'short', day: 'numeric' })}
              </h3>
              {canEdit && (
                <button
                  type="button"
                  onClick={() =>
                    onCreate({
                      dateKey: key,
                      startTime: DEFAULT_SHIFT.start,
                      endTime: DEFAULT_SHIFT.end,
                    })
                  }
                  className="text-primary-600 text-xs font-medium"
                >
                  + Add
                </button>
              )}
            </div>
            {dayOccs.length === 0 ? (
              <p className="text-xs text-neutral-400">No shifts</p>
            ) : (
              <ul className="space-y-2">
                {dayOccs.map((occ) => {
                  const staff = staffById.get(occ.schedule.userId);
                  return (
                    <li key={occ.key}>
                      <button
                        type="button"
                        onClick={() => onOpen(occ)}
                        className={[
                          'flex w-full items-center justify-between rounded-md border-l-4 px-3 py-2 text-left text-sm',
                          shiftColor(occ, staff),
                          conflicts.has(occ.key) ? 'ring-danger-500 ring-2' : '',
                        ].join(' ')}
                      >
                        <span>
                          <span className="block font-semibold">{staff?.name ?? 'Staff'}</span>
                          <span className="text-xs opacity-80">
                            {staff?.role ?? ''}
                            {!occ.schedule.isAvailable && ' · unavailable'}
                          </span>
                        </span>
                        <span className="font-mono text-xs">
                          {occ.startTime}–{occ.endTime}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function ScheduleCalendar(props: ScheduleCalendarProps) {
  return props.view === 'week' ? <WeekView {...props} /> : <MonthView {...props} />;
}
