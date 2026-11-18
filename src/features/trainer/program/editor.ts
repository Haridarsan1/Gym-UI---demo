import { addDays } from "@/domain/dates";
import { cloneWeek, MAX_WEEKS, moveItem, newKey, type EditorDay, type EditorDoc, type EditorRx, type EditorWeek, type Section } from "@/domain/program";

/** The builder’s state: the document, the start date, which day is open, and whether there is anything unsaved. */
export interface EditorState {
  doc: EditorDoc;
  startsOn: string;
  /** The open day. */
  selected: { week: number; dayKey?: string };
  dirty: boolean;
  savedAt?: string;
}

export type Action =
  | { type: "name"; name: string }
  | { type: "notes"; notes: string }
  | { type: "start"; startsOn: string }
  | { type: "select"; week: number; dayKey?: string }
  | { type: "addWeek"; rest?: boolean }
  | { type: "copyWeek"; week: number }
  | { type: "removeWeek"; week: number }
  | { type: "addDay"; week: number }
  | { type: "removeDay"; week: number; dayKey: string }
  | { type: "copyDay"; week: number; dayKey: string }
  | { type: "day"; week: number; dayKey: string; patch: Partial<Pick<EditorDay, "title" | "weekday">> }
  | { type: "addRx"; week: number; dayKey: string; exerciseId: string; section: Section }
  | { type: "rx"; week: number; dayKey: string; rxKey: string; patch: Partial<EditorRx> }
  | { type: "removeRx"; week: number; dayKey: string; rxKey: string }
  | { type: "moveRx"; week: number; dayKey: string; from: number; to: number }
  | { type: "replace"; doc: EditorDoc; startsOn?: string }
  | { type: "saved"; at: string };

export const blankDay = (weekday: number, title = ""): EditorDay => ({ key: newKey("d"), title, weekday, items: [] });
export const blankDoc = (name = ""): EditorDoc => ({ name, notes: "", weeks: [{ key: newKey("w"), days: [blankDay(0, "Day 1")] }] });

const mapDay = (doc: EditorDoc, week: number, dayKey: string, fn: (d: EditorDay) => EditorDay): EditorDoc => ({ ...doc, weeks: doc.weeks.map((w, i) => (i !== week ? w : { ...w, days: w.days.map((d) => (d.key === dayKey ? fn(d) : d)) })) });

/** The first weekday of a week that has no workout yet, or the last one. */
const freeWeekday = (w: EditorWeek) => [0, 2, 4, 1, 3, 5, 6].find((n) => !w.days.some((d) => d.weekday === n)) ?? 6;

export function reducer(s: EditorState, a: Action): EditorState {
  const touch = (doc: EditorDoc, extra: Partial<EditorState> = {}): EditorState => ({ ...s, ...extra, doc, dirty: true });
  switch (a.type) {
    case "name": return touch({ ...s.doc, name: a.name });
    case "notes": return touch({ ...s.doc, notes: a.notes });
    case "start": return { ...s, startsOn: a.startsOn, dirty: true };
    case "select": return { ...s, selected: { week: a.week, dayKey: a.dayKey } };
    case "addWeek": {
      if (s.doc.weeks.length >= MAX_WEEKS) return s;
      const week: EditorWeek = a.rest ? { key: newKey("w"), days: [] } : cloneWeek(s.doc.weeks.at(-1) ?? { key: "x", days: [] });
      return touch({ ...s.doc, weeks: [...s.doc.weeks, week] }, { selected: { week: s.doc.weeks.length, dayKey: week.days[0]?.key } });
    }
    case "copyWeek": {
      if (s.doc.weeks.length >= MAX_WEEKS) return s;
      const copy = cloneWeek(s.doc.weeks[a.week]!);
      const weeks = [...s.doc.weeks.slice(0, a.week + 1), copy, ...s.doc.weeks.slice(a.week + 1)];
      return touch({ ...s.doc, weeks }, { selected: { week: a.week + 1, dayKey: copy.days[0]?.key } });
    }
    case "removeWeek": {
      if (s.doc.weeks.length <= 1) return s;
      const weeks = s.doc.weeks.filter((_, i) => i !== a.week);
      const week = Math.min(s.selected.week > a.week ? s.selected.week - 1 : s.selected.week, weeks.length - 1);
      return touch({ ...s.doc, weeks }, { selected: { week, dayKey: weeks[week]?.days[0]?.key } });
    }
    case "addDay": {
      const w = s.doc.weeks[a.week]!;
      if (w.days.length >= 7) return s;
      const day = blankDay(freeWeekday(w), `Day ${w.days.length + 1}`);
      return touch({ ...s.doc, weeks: s.doc.weeks.map((x, i) => (i === a.week ? { ...x, days: [...x.days, day] } : x)) }, { selected: { week: a.week, dayKey: day.key } });
    }
    case "removeDay": {
      const doc = { ...s.doc, weeks: s.doc.weeks.map((w, i) => (i === a.week ? { ...w, days: w.days.filter((d) => d.key !== a.dayKey) } : w)) };
      return touch(doc, { selected: { week: a.week, dayKey: doc.weeks[a.week]!.days[0]?.key } });
    }
    case "copyDay": {
      const w = s.doc.weeks[a.week]!;
      const src = w.days.find((d) => d.key === a.dayKey);
      if (!src || w.days.length >= 7) return s;
      const day: EditorDay = { ...src, key: newKey("d"), title: `${src.title} (copy)`, weekday: freeWeekday(w), items: src.items.map((i) => ({ ...i, key: newKey("r") })) };
      return touch({ ...s.doc, weeks: s.doc.weeks.map((x, i) => (i === a.week ? { ...x, days: [...x.days, day] } : x)) }, { selected: { week: a.week, dayKey: day.key } });
    }
    case "day": return touch(mapDay(s.doc, a.week, a.dayKey, (d) => ({ ...d, ...a.patch })));
    case "addRx": return touch(mapDay(s.doc, a.week, a.dayKey, (d) => ({ ...d, items: [...d.items, { key: newKey("r"), exerciseId: a.exerciseId, section: a.section, sets: 3, reps: a.section === "main" ? "10" : "" , ...(a.section !== "main" ? { durationSec: 45 } : {}) }] })));
    case "rx": return touch(mapDay(s.doc, a.week, a.dayKey, (d) => ({ ...d, items: d.items.map((i) => (i.key === a.rxKey ? { ...i, ...a.patch } : i)) })));
    case "removeRx": return touch(mapDay(s.doc, a.week, a.dayKey, (d) => ({ ...d, items: d.items.filter((i) => i.key !== a.rxKey) })));
    case "moveRx": return touch(mapDay(s.doc, a.week, a.dayKey, (d) => ({ ...d, items: moveItem(d.items, a.from, a.to) })));
    case "replace": return { ...s, doc: a.doc, startsOn: a.startsOn ?? s.startsOn, selected: { week: 0, dayKey: a.doc.weeks[0]?.days[0]?.key }, dirty: true };
    case "saved": return { ...s, dirty: false, savedAt: a.at };
  }
}

export const initialState = (doc: EditorDoc, startsOn: string, savedAt?: string): EditorState => ({ doc, startsOn, selected: { week: 0, dayKey: doc.weeks[0]?.days[0]?.key }, dirty: false, savedAt });

/** A date a number of days later, for the start date field’s limits. */
export const later = (date: string, days: number) => addDays(date, days);
