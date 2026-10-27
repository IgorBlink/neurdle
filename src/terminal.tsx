import { Fragment, useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import Markdown from "react-markdown";

/** md lines render markdown */
type Line = { id: number; text: string; cls?: string; md?: boolean };
export type MenuItem = { label: string; run: () => void; extra?: boolean };
type Menu = { title: string; items: MenuItem[] };

export function useTerminal() {
  const [lines, setLines] = useState<Line[]>([]);
  const [menu, setMenu] = useState<Menu | null>(null);
  const next = useRef(0);
  const push = useCallback((line: Omit<Line, "id">) => setLines((ls) => [...ls, { ...line, id: next.current++ }]), []);
  const print = useCallback((text: string, cls?: string) => push({ text, cls }), [push]);
  const printMd = useCallback((text: string, cls?: string) => push({ text, md: true, cls }), [push]);
  const showMenu = useCallback((title: string, items: MenuItem[]) => setMenu({ title, items }), []);
  const hideMenu = useCallback(() => setMenu(null), []);
  const reset = useCallback(() => {
    setLines([]);
    setMenu(null);
  }, []);
  return { lines, menu, print, printMd, showMenu, hideMenu, reset };
}
export type TerminalApi = ReturnType<typeof useTerminal>;

/** TeX like $2 + 2 = 4$ is shown without its delimiters. react-markdown escapes raw HTML such as <think>. */
const untex = (s: string) =>
  s
    .replace(/\$\$([\s\S]*?)\$\$/g, "$1")
    .replace(/\$([^$\n]+)\$/g, "$1")
    .replace(/\\text\{([^}]*)\}/g, "$1")
    .replace(/\\times/g, "×")
    .replace(/\\cdot/g, "·");

export function Terminal({ term }: { term: TerminalApi }) {
  const { lines, menu } = term;
  const [sel, setSel] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setSel(0), [menu]);
  useEffect(() => box.current?.focus({ preventScroll: true }), []);

  // Each choice redraws the whole screen (the game calls reset and prints the new state), like a TUI.
  const choose = (i: number) => {
    if (!menu) return;
    const item = menu.items[i];
    term.hideMenu();
    item.run();
    box.current?.focus({ preventScroll: true });
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (!menu?.items.length || e.metaKey || e.ctrlKey || e.altKey) return;
    const n = menu.items.length;
    if (e.key === "ArrowDown" || e.key === "j") setSel((s) => (s + 1) % n);
    else if (e.key === "ArrowUp" || e.key === "k") setSel((s) => (s - 1 + n) % n);
    else if (e.key === "Enter" || e.key === " ") choose(sel);
    else if (/^[1-9]$/.test(e.key) && +e.key <= n) choose(+e.key - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div className="term" ref={box} tabIndex={0} onKeyDown={onKeyDown} aria-label="Neurdle terminal, choose with the arrow keys and Enter">
      <div className="out" aria-live="polite">
        {lines.map((l) =>
          l.md ? (
            <div key={l.id} className={`md${l.cls ? ` ${l.cls}` : ""}`}>
              <Markdown>{untex(l.text)}</Markdown>
            </div>
          ) : (
            <div key={l.id} className={l.cls}>
              {l.text}
            </div>
          ),
        )}
      </div>
      {menu && (
        <div className="menu" role="listbox">
          {menu.title && <div className="title">? {menu.title}</div>}
          {menu.items.map((it, i) => (
            <Fragment key={it.label}>
              {it.extra && i > 0 && !menu.items[i - 1].extra && <div className="sep">{"  ──"}</div>}
              <button type="button" tabIndex={-1} role="option" aria-selected={i === sel} className="opt" onMouseEnter={() => setSel(i)} onClick={() => choose(i)}>
                {it.label}
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
