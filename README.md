```text
███╗   ██╗███████╗██╗   ██╗██████╗ ██████╗ ██╗     ███████╗
████╗  ██║██╔════╝██║   ██║██╔══██╗██╔══██╗██║     ██╔════╝
██╔██╗ ██║█████╗  ██║   ██║██████╔╝██║  ██║██║     █████╗
██║╚██╗██║██╔══╝  ██║   ██║██╔══██╗██║  ██║██║     ██╔══╝
██║ ╚████║███████╗╚██████╔╝██║  ██║██████╔╝███████╗███████╗
╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚══════╝╚══════╝
```

A guessing game about the inside of a language model. A few neurons in Qwen3.5-4B were changed, and then it answered a plain question. Name what was pushed, then find the neurons on a 3D map of the model.

**Play:** https://neurdle.vercel.app

## How to play

Each puzzle shows a question and the model's answer. The answer comes from the changed model, so its voice is off: "Tell me about yourself." becomes "I'm designed to be helpful and harmless, and I want to cause you pain."

There are two modes, toggled at the top:

- **Default.** Four options, each a set of neuron edits such as `L14 N8949 +1  L13 N7956 -1`. Pick the one that was applied. You get two tries: 5000 points on the first, 2500 on the second. Then find the neurons on the map and lock in a pin for up to 5000 more.
- **Easy.** The same options, with the name of what the change did in brackets, for example `(Evil AI)`. The map is solved as soon as you name the neurons, so there is no pin to place.

Map score is based on the distance from your pin to the nearest changed neuron, counted in cells. One layer is 12 cells. The score is `5000 · e^(−d/24)`. A whole-layer vector counts by layer only.

Controls: hover a neuron to see what it pushes up and down. Click to pin. Drag to orbit, scroll or pinch to zoom. The L0–L31 buttons turn to face one layer.

## Recipes

A recipe like `L14N8949+1` adds a delta to neuron 8949 at layer 14, counting layers from 0. The delta at the input of the MLP down-projection is the dose times the median residual-stream norm leaving that layer, divided by the norm of that neuron's column in `W_down`. Recipes of the form `vector <name> @ layer 12 x4` instead add a mean residual difference at a layer's output, the way persona vectors are usually built (CAA).

## Credits

The map and the steering lens come from [neuron-explorer](https://github.com/lyramakesmusic/neuron-explorer) by Lyra. The map layout and the per-neuron top tokens in `public/data/geo.json` are derived from its cache.

The author of neuron-explorer has given permission to use its cache and to publish this derived data.

## Data

- `public/data/puzzles.json`: 30 puzzles. Each has a question, a steered answer, a hint question with its own answer, the recipe, and a short note. It also holds the unsteered answers to the three base questions.
- `public/data/geo.json`: the map for 32 layers of 96×96 neuron cells. Arrays are base64-encoded typed arrays: steering strength, neuron id, and the top tokens pushed up and down.

Generation is not included in this repository. Answers were sampled with a 160-token cap, so some end mid-sentence.

## Develop

Requires [bun](https://bun.sh).

```bash
bun install
bun run dev     # http://localhost:5173
bun run build   # type-check, then build to dist/
```

`bun run data` rebuilds `public/data` from the generation outputs. Those outputs are not in this repository, so the script needs them locally.

## Layout

- `src/rules.ts`: scoring, option text, pin geometry
- `src/Game.tsx`: puzzle flow and state
- `src/NeuronMap.tsx`: 3D map (react-three-fiber)
- `src/terminal.tsx`: terminal screen and menus
- `src/data.ts`: loads puzzles and map data
- `scripts/export_data.py`: turns generation outputs into `public/data`

## License

This is free and unencumbered software released into the public domain. See [LICENSE](LICENSE).
