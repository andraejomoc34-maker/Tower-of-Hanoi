<<<<<<< HEAD
# Tower of Hanoi

A responsive Tower of Hanoi puzzle that fetches the optimal solution from an Express API and plays it with animated disks and synthesized Web Audio effects.

## Requirements

- Node.js 18 or newer
- npm

## Install and run

```sh
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). Set `PORT` to use a different port.

## Tests

```sh
npm test
```

## API

### `GET /api/solve?disks=N`

Returns the optimal move sequence for an integer disk count from 1 through 10.

Successful response (`N = 2`):

```json
{
  "disks": 2,
  "totalMoves": 3,
  "moves": [
    { "disk": 1, "from": "A", "to": "B" },
    { "disk": 2, "from": "A", "to": "C" },
    { "disk": 1, "from": "B", "to": "C" }
  ]
}
```

Invalid or missing disk counts return HTTP 400:

```json
{ "error": "disks must be an integer from 1 to 10." }
```

The solver is also available as the `solveHanoi` named export from `solver.js`. It throws a `RangeError` for disk counts outside the supported range.

### `POST /api/solve`

Finds a shortest legal route to peg C from a custom state. Peg arrays are ordered bottom-to-top and must contain each disk exactly once. Disk count is inferred from the arrays (1 through 10).

```json
{
  "pegs": {
    "A": [4, 3],
    "B": [2],
    "C": [1]
  }
}
```

The response has the same `disks`, `totalMoves`, and `moves` shape as the GET endpoint. Invalid states return HTTP 400 with an `error` message.

## How it works

Use **Play yourself** to move the top disk by dragging it, or tap a disk and then a destination peg. Illegal moves are rejected. **Hint** highlights the next shortest-path move. **Auto solve** requests a shortest path from the current board state; pause, resume, and step controls let you control the animation. Reset cancels playback and restores the initial peg state. The timer, optimal move count, and star rating track your run. **Beat the par** adds a time target based on the optimal move count.

The audio module lazily creates its `AudioContext` after a user gesture. It synthesizes pickup tones, filtered-noise slides, disk-size-dependent landing notes, and a victory arpeggio; a gain node provides a low master volume and the mute toggle silences it.
=======
# Tower-of-Hanoi
Tower of hanoi
>>>>>>> e3ccd93ba97afe65d8fbca982b284182f48d5e35
