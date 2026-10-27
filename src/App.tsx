import { useEffect, useState } from "react";
import { loadPuzzles, type PuzzleData } from "./data";
import { Game } from "./Game";
import { Terminal, useTerminal } from "./terminal";

// figlet "ANSI Shadow"
const BANNER = `███╗   ██╗███████╗██╗   ██╗██████╗ ██████╗ ██╗     ███████╗
████╗  ██║██╔════╝██║   ██║██╔══██╗██╔══██╗██║     ██╔════╝
██╔██╗ ██║█████╗  ██║   ██║██████╔╝██║  ██║██║     █████╗
██║╚██╗██║██╔══╝  ██║   ██║██╔══██╗██║  ██║██║     ██╔══╝
██║ ╚████║███████╗╚██████╔╝██║  ██║██████╔╝███████╗███████╗
╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚══════╝╚══════╝`;

const EASY_KEY = "neurdle:easy";

function savedEasy() {
  try {
    return localStorage.getItem(EASY_KEY) === "1";
  } catch {
    return false;
  }
}

export default function App() {
  const [data, setData] = useState<PuzzleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [easy, setEasy] = useState(savedEasy);
  const term = useTerminal();

  useEffect(() => {
    loadPuzzles().then(setData, (e) => setError(String(e)));
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(EASY_KEY, easy ? "1" : "0");
    } catch {
      // storage blocked: the toggle still works for this visit
    }
  }, [easy]);

  // The whole page is one terminal: the intro reads as the output of ./neurdle, then the game's screen, then the map pane.
  return (
    <main className="screen">
      <header className="intro">
        <div className="topbar">
          <button type="button" role="switch" aria-checked={easy} className="toggle" onClick={() => setEasy((e) => !e)}>
            <span className="box">[{easy ? "x" : " "}]</span> easy mode
          </button>
        </div>
        <pre className="banner" aria-label="Neurdle">{BANNER}</pre>
        <div>A few neurons inside Qwen3.5-4B were changed, then it answered a plain question.</div>
        <div>Pick which neurons were changed, then find them on the map of the model.</div>
        <div className="dim">
          credits: neuron map and steer lens from{" "}
          <a href="https://github.com/lyramakesmusic/neuron-explorer" target="_blank" rel="noopener">
            neuron-explorer
          </a>
        </div>
      </header>
      <Terminal term={term} />
      {error && <div className="bad">could not load the puzzles: {error}</div>}
      {data && <Game data={data} term={term} easy={easy} />}
    </main>
  );
}
