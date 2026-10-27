import { useEffect, useRef, useState } from "react";
import { loadGeo, type GeoData, type Puzzle, type PuzzleData } from "./data";
import { TRIES, choicesFor, geoScore, labelPoints, optionText, pad, targetsFor, where, type GeoHit, type Pin } from "./rules";
import { NeuronMap, type Mark } from "./NeuronMap";
import type { MenuItem, TerminalApi } from "./terminal";

type MapView = { round: number; easy: boolean; named: boolean; pin: Pin | null; locked: boolean; hit: GeoHit | null; marks: Mark[] };

/**
 * One puzzle, four options, two tries (5000 points first try, 2500 second). The default mode offers recipes such as
 * "L14 N8949 +1" and then a map pin (up to 5000 more), in any order; a pin locked before the neurons are named keeps
 * its answer hidden until then. Easy mode offers what the change did ("Evil AI") and has no pin.
 */
export function Game({ data, term, easy }: { data: PuzzleData; term: TerminalApi; easy: boolean }) {
  const { print, printMd, showMenu, reset } = term; // stable callbacks
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [view, setView] = useState<MapView | null>(null);
  const geoRef = useRef<GeoData | null>(null);
  const easyRef = useRef(easy);
  const actions = useRef({ pin: (_: Pin) => {}, lock: () => {}, mode: () => {} });

  useEffect(() => {
    loadGeo().then(
      (g) => {
        geoRef.current = g;
        setGeo(g);
      },
      (e) => setMapError(String(e)),
    );
  }, []);

  useEffect(() => {
    const all = data.puzzles;
    const s = {
      idx: 0, round: 0, easy: false,
      misses: 0, wrong: [] as Puzzle[], won: false, named: false, choices: [] as Puzzle[],
      pin: null as Pin | null, locked: false, skipped: false, hit: null as GeoHit | null,
    };
    const cur = () => all[s.idx];
    /** A random puzzle other than the current one. */
    const another = () => {
      let i = s.idx;
      while (all.length > 1 && i === s.idx) i = Math.floor(Math.random() * all.length);
      return i;
    };
    const finished = () => s.named && (s.easy || s.locked || s.skipped);
    /** Easy mode names what each recipe did, in brackets after it. */
    const option = (q: Puzzle) => (s.easy ? `${optionText(q)}  (${q.label})` : optionText(q));

    function start(idx: number) {
      Object.assign(s, {
        idx: idx % all.length, round: s.round + 1, easy: easyRef.current,
        misses: 0, wrong: [], won: false, named: false, pin: null, locked: false, skipped: false, hit: null,
      });
      s.choices = choicesFor(cur(), all);
      screen();
    }
    function syncMap() {
      const p = cur();
      // options stay off the map; a wrong guess shows where it lives, the answer shows once the puzzle is over
      const marks: Mark[] = s.wrong.map((q) => ({ key: `wrong ${q.id}`, kind: "wrong", title: s.easy ? `✗ ${q.label}` : "✗ wrong guess", puzzle: q }));
      if (finished()) marks.push({ key: "answer", kind: "answer", title: `${s.won ? "✓ " : "it was: "}${p.label}`, puzzle: p });
      setView({ round: s.round, easy: s.easy, named: s.named, pin: s.pin, locked: s.locked || s.skipped, hit: finished() ? s.hit : null, marks });
    }
    /** Clears the terminal and draws the puzzle in its current state. */
    function screen() {
      const p = cur();
      syncMap();
      reset();
      print(`neurdle:~$ cat puzzle-${pad(s.idx + 1)}.txt`, "dim");
      print(p.q, "q");
      printMd(p.a, "reply");
      if (s.misses && !s.named) print(s.wrong.map((q) => `✗ ${option(q)}`).join("\n"), "bad echo");
      if (s.named) {
        print(s.won ? `✓ ${option(p)}${s.misses ? "  (second try)" : ""}` : `✗ ${s.wrong.map(option).join(", ")}. it was: ${option(p)}`, `echo ${s.won ? "ok" : "bad"}`);
      }
      if (s.misses && !finished()) print(`red on the map: where ${s.misses > 1 ? "those guesses live" : "that guess lives"}`, "dim");
      if (s.misses && !s.named) {
        print("hint, same neurons:", "dim echo");
        print(p.hintQ, "q");
        printMd(p.hint, "reply");
      }
      if (s.locked && !finished()) print(`map pin locked on L${s.pin!.layer}${s.named ? ` N${s.pin!.neuron}` : ""}; its score shows once you pick the neurons`, "dim echo");
      if (finished()) return summary();
      if (!s.named) {
        const items: MenuItem[] = s.choices.filter((q) => !s.wrong.includes(q)).map((q) => ({ label: option(q), run: () => guess(q) }));
        showMenu("which neurons were changed?", items);
      } else {
        showMenu("now find them on the map below and lock in a pin", [{ label: "skip the map", extra: true, run: () => { s.skipped = true; screen(); } }]);
      }
    }
    function summary() {
      const p = cur();
      const name = labelPoints(s.won, s.misses);
      const map = s.hit?.score ?? 0;
      print(`score   ${name + map} / 10000   (neurons ${name} + map ${map})`, "echo");
      if (!s.easy) print(`pushed  ${p.label}`);
      if (s.hit && s.pin) {
        const at = s.hit.neuron < 0 ? `L${s.hit.layer}, whole-layer vector` : `L${s.hit.layer} N${s.hit.neuron}`;
        print(`map     pin L${s.pin.layer} N${s.pin.neuron} · answer ${at} · off by ${s.hit.layersOff} layer${s.hit.layersOff === 1 ? "" : "s"}${s.hit.neuron < 0 ? "" : `, ${s.hit.cellsOff} cells`}`);
      } else print("map     skipped");
      print(`where   ${where(p)}`);
      print(p.note, "dim echo");
      showMenu("", [{ label: "next puzzle", run: () => start(another()) }]);
    }
    /** Easy mode solves the map as soon as the neurons are named: the pin lands on the answer's first neuron. */
    function solveMap() {
      const g = geoRef.current;
      const t = g && targetsFor(cur(), g.targets, g.side)[0];
      if (!g || !t) return;
      s.pin = { layer: t[0], row: t[1], col: t[2], neuron: t[3] };
      s.locked = true;
      s.hit = geoScore(s.pin, targetsFor(cur(), g.targets, g.side));
    }
    function guess(q: Puzzle) {
      if (q === cur()) {
        s.won = true;
        s.named = true;
      } else {
        s.misses += 1;
        s.wrong.push(q);
        s.named = s.misses >= TRIES;
      }
      if (s.named && s.easy) solveMap();
      screen();
    }
    actions.current = {
      pin: (p: Pin) => {
        if (s.easy || s.locked || s.skipped) return;
        s.pin = p;
        syncMap();
      },
      lock: () => {
        const g = geoRef.current;
        if (s.easy || !g || !s.pin || s.locked || s.skipped) return;
        s.locked = true;
        s.hit = geoScore(s.pin, targetsFor(cur(), g.targets, g.side));
        screen();
      },
      // switching modes starts the current puzzle over in the new one
      mode: () => {
        if (s.easy !== easyRef.current) start(s.idx);
      },
    };

    start(Math.floor(Math.random() * all.length));
  }, [data, print, printMd, showMenu, reset]);

  useEffect(() => {
    easyRef.current = easy;
    actions.current.mode();
  }, [easy]);

  return (
    <section className="panel" aria-label="Map of the model">
      <div className="panel-title">map · 32 layers × 9,216 neurons</div>
      {mapError ? (
        <div className="mapwrap loading bad">could not load the map: {mapError}</div>
      ) : !geo || !view ? (
        <div className="mapwrap loading">loading the map…</div>
      ) : (
        <NeuronMap
          geo={geo}
          round={view.round}
          pinnable={!view.easy}
          numbers={view.named}
          pin={view.pin}
          locked={view.locked}
          hit={view.hit}
          marks={view.marks}
          onPin={(p) => actions.current.pin(p)}
          onLock={() => actions.current.lock()}
        />
      )}
    </section>
  );
}
