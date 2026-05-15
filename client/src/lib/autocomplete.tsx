import {
  useEffect, useState, useRef, useCallback, type KeyboardEvent, type ChangeEvent,
  type CSSProperties
} from 'react';
import { api } from './api';

// ---------- Shared suggestions source -------------------------------------
// One in-memory cache shared across all autocomplete components on the page.
// Refreshes every 5 seconds.

let cachedNames: string[] = [];
let lastFetchAt = 0;
const subscribers = new Set<(names: string[]) => void>();

async function refreshNames(): Promise<void> {
  try {
    const r = await api.getVariableNames();
    cachedNames = r.names;
    lastFetchAt = Date.now();
    for (const fn of subscribers) fn(cachedNames);
  } catch { /* ignore */ }
}

export function useVariableSuggestions(): string[] {
  const [names, setNames] = useState<string[]>(cachedNames);
  useEffect(() => {
    subscribers.add(setNames);
    // Fetch on mount if stale.
    if (Date.now() - lastFetchAt > 2000) void refreshNames();
    const id = setInterval(() => { void refreshNames(); }, 5000);
    return () => {
      subscribers.delete(setNames);
      clearInterval(id);
    };
  }, []);
  return names;
}

/** Manually trigger a refresh, e.g. after the user adds a watched variable. */
export function refreshVariableSuggestions(): void {
  void refreshNames();
}

// ---------- Token parsing -------------------------------------------------
// Given the text and a cursor position, find an in-progress `$(...` token
// the cursor is inside. Returns the start index (of '$') and the partial
// query string (what's between '(' and cursor). null if not in a token.

interface ActiveToken {
  start: number;       // index of the '$' in text
  parenStart: number;  // index of '(' (== start + 1 if user typed contiguously)
  query: string;       // text between '(' and the cursor
}

function findActiveToken(text: string, cursor: number): ActiveToken | null {
  // Walk backward from cursor looking for the most recent '$' that introduces
  // a still-open variable token.
  for (let i = cursor - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === ')') return null;            // token already closed
    if (ch === '\n') return null;           // newline ends token scope
    if (ch !== '$') continue;

    // Found a '$'. Two forms:
    // 1. `$(` - the formal Companion syntax; query is between '(' and cursor.
    // 2. bare `$` followed by varname-like chars; query is those chars.
    const next = text[i + 1];
    if (next === '(') {
      const query = text.slice(i + 2, cursor);
      // Only valid varname chars allowed in the query - if there's something
      // unexpected the token is malformed; bail.
      if (/[^\w:.\-]/.test(query)) return null;
      return { start: i, parenStart: i + 1, query };
    }

    // Bare $. The "query" is everything from i+1 up to the cursor.
    // Allowed varname chars are: word chars, ':', '.', '-'. Anything else
    // (space, punctuation, special chars) terminates the token.
    const between = text.slice(i + 1, cursor);
    if (/[^\w:.\-]/.test(between)) return null;
    return { start: i, parenStart: -1, query: between };
  }
  return null;
}

// ---------- Filtering -----------------------------------------------------

function filterSuggestions(all: string[], query: string, max = 8): string[] {
  if (!query) return all.slice(0, max);
  const q = query.toLowerCase();
  // Prioritize prefix matches over substring matches.
  const prefix: string[] = [];
  const substr: string[] = [];
  for (const n of all) {
    const lower = n.toLowerCase();
    if (lower.startsWith(q)) prefix.push(n);
    else if (lower.includes(q)) substr.push(n);
  }
  return [...prefix, ...substr].slice(0, max);
}

// ---------- Dropdown UI ---------------------------------------------------

function Dropdown({
  items, selectedIndex, onPick, style
}: {
  items: string[];
  selectedIndex: number;
  onPick: (name: string) => void;
  style?: CSSProperties;
}) {
  if (items.length === 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        zIndex: 100,
        background: '#1a1a1a',
        border: '1px solid #2a2a2a',
        borderRadius: 4,
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        maxHeight: 200,
        overflowY: 'auto',
        minWidth: 220,
        ...style
      }}
      // Prevent the input from losing focus when clicking a suggestion.
      onMouseDown={e => e.preventDefault()}
    >
      {items.map((name, i) => (
        <div
          key={name}
          onClick={() => onPick(name)}
          style={{
            padding: '6px 10px',
            fontFamily: 'ui-monospace, Menlo, monospace',
            fontSize: 12,
            color: i === selectedIndex ? '#fff' : '#cbd5e1',
            background: i === selectedIndex ? '#2563eb' : 'transparent',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          $({name})
        </div>
      ))}
    </div>
  );
}

// ---------- Shared logic hook --------------------------------------------
// All inputs share the same state machine. The element type (textarea vs
// input) only affects how we render the wrapper.

function useAutocompleteState(
  value: string,
  onChange: (v: string) => void,
  ref: React.RefObject<HTMLTextAreaElement | HTMLInputElement>,
  options?: { wrapBareVar?: boolean }
) {
  const wrapBareVar = options?.wrapBareVar ?? true;
  const all = useVariableSuggestions();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<ActiveToken | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const items = token ? filterSuggestions(all, token.query) : [];

  // Re-evaluate token on every selection change (typing, click, arrow keys).
  const recompute = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const cursor = el.selectionStart ?? value.length;
    const t = findActiveToken(value, cursor);
    setToken(t);
    setOpen(!!t);
    setSelectedIndex(0);
  }, [value, ref]);

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    onChange(e.target.value);
    // After React updates, recompute on next tick.
    requestAnimationFrame(recompute);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (!open || items.length === 0) {
      // Recompute on cursor moves so user can re-open dropdown by clicking
      // into an existing token.
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
        requestAnimationFrame(recompute);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => (i + 1) % items.length);
        return;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => (i - 1 + items.length) % items.length);
        return;
      case 'Enter':
      case 'Tab': {
        e.preventDefault();
        const name = items[selectedIndex];
        if (name) insert(name);
        return;
      }
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        return;
    }
  };

  const insert = (name: string) => {
    if (!token) return;
    const el = ref.current;
    const cursor = el?.selectionStart ?? value.length;
    // Build the replacement. Decide based on what's currently in the text:
    // - $(query  -> we replace "$(query" with "$(name)"
    // - $query   -> we replace "$query" with "$(name)" if wrapBareVar
    //              else just "name"
    let before: string;
    let inserted: string;
    let cursorAfter: number;
    if (token.parenStart >= 0) {
      // Has opening paren already
      before = value.slice(0, token.start);
      inserted = `$(${name})`;
      // Check if there's a closing paren we shouldn't duplicate.
      const after = value.slice(cursor);
      const trimmedAfter = after.match(/^[\w:.\-]*\)?/)?.[0] ?? '';
      const rest = value.slice(cursor + trimmedAfter.length);
      cursorAfter = before.length + inserted.length;
      onChange(before + inserted + rest);
    } else {
      // Bare $ (no paren). Wrap the whole thing.
      before = value.slice(0, token.start);
      inserted = wrapBareVar ? `$(${name})` : name;
      const after = value.slice(cursor);
      const trimmedAfter = after.match(/^[\w:.\-]*/)?.[0] ?? '';
      const rest = value.slice(cursor + trimmedAfter.length);
      cursorAfter = before.length + inserted.length;
      onChange(before + inserted + rest);
    }
    setOpen(false);
    setToken(null);
    // Restore focus + cursor position after React commits.
    requestAnimationFrame(() => {
      const el2 = ref.current;
      if (el2) {
        el2.focus();
        el2.setSelectionRange(cursorAfter, cursorAfter);
      }
    });
  };

  const handleSelect = () => {
    requestAnimationFrame(recompute);
  };

  return {
    open: open && items.length > 0,
    items,
    selectedIndex,
    handleInputChange,
    handleKeyDown,
    handleSelect,
    pickItem: insert
  };
}

// ---------- Textarea variant ----------------------------------------------

export function VarAutocompleteTextarea({
  value, onChange, ...rest
}: {
  value: string;
  onChange: (v: string) => void;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const state = useAutocompleteState(value, onChange, ref);
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <textarea
        ref={ref}
        value={value}
        onChange={state.handleInputChange}
        onKeyDown={state.handleKeyDown}
        onSelect={state.handleSelect}
        onBlur={() => requestAnimationFrame(() => {/* dropdown closes on next render */})}
        {...rest}
      />
      {state.open && (
        <Dropdown
          items={state.items}
          selectedIndex={state.selectedIndex}
          onPick={state.pickItem}
          style={{ left: 0, top: '100%', marginTop: 2 }}
        />
      )}
    </div>
  );
}

// ---------- Input variant -------------------------------------------------

export function VarAutocompleteInput({
  value, onChange, wrapBareVar, ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  /** When true (default), inserting wraps as `$(name)`. Set false for fields
   * like the rule "variable" input which expects bare `conn:name`. */
  wrapBareVar?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const ref = useRef<HTMLInputElement>(null);
  const state = useAutocompleteState(value, onChange, ref, { wrapBareVar });
  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <input
        ref={ref}
        value={value}
        onChange={state.handleInputChange}
        onKeyDown={state.handleKeyDown}
        onSelect={state.handleSelect}
        {...rest}
      />
      {state.open && (
        <Dropdown
          items={state.items}
          selectedIndex={state.selectedIndex}
          onPick={state.pickItem}
          style={{ left: 0, top: '100%', marginTop: 2 }}
        />
      )}
    </div>
  );
}