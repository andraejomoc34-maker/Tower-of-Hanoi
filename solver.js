/**
 * Return the optimal sequence of moves for a Tower of Hanoi puzzle.
 *
 * @param {number} disks Number of disks, from 1 through 10.
 * @param {string} source Starting peg.
 * @param {string} auxiliary Temporary peg.
 * @param {string} target Destination peg.
 * @returns {{ disk: number, from: string, to: string }[]} Ordered moves.
 */
export function solveHanoi(disks, source = "A", auxiliary = "B", target = "C") {
  if (!Number.isInteger(disks) || disks < 1 || disks > 10) {
    throw new RangeError("Disk count must be an integer from 1 to 10.");
  }

  const moves = [];

  function moveTower(count, from, spare, to) {
    if (count === 0) return;

    moveTower(count - 1, from, to, spare);
    moves.push({ disk: count, from, to });
    moveTower(count - 1, spare, from, to);
  }

  moveTower(disks, source, auxiliary, target);
  return moves;
}

/**
 * Validate a bottom-to-top peg state containing each disk exactly once.
 *
 * @param {{ A: number[], B: number[], C: number[] }} pegs Peg stacks.
 * @param {number} disks Total number of disks.
 */
export function validatePegState(pegs, disks) {
  if (!Number.isInteger(disks) || disks < 1 || disks > 10) {
    throw new RangeError("Disk count must be an integer from 1 to 10.");
  }
  if (!pegs || typeof pegs !== "object" || Array.isArray(pegs)) {
    throw new TypeError("pegs must contain arrays for A, B, and C.");
  }

  const keys = Object.keys(pegs).sort();
  if (keys.join(",") !== "A,B,C" || !keys.every((peg) => Array.isArray(pegs[peg]))) {
    throw new TypeError("pegs must contain arrays for A, B, and C.");
  }

  const seen = new Set();
  for (const peg of ["A", "B", "C"]) {
    const stack = pegs[peg];
    for (let index = 0; index < stack.length; index += 1) {
      const disk = stack[index];
      if (!Number.isInteger(disk) || disk < 1 || disk > disks || seen.has(disk)) {
        throw new TypeError("Each disk from 1 to the disk count must appear exactly once.");
      }
      if (index > 0 && stack[index - 1] < disk) {
        throw new TypeError("Peg arrays must be ordered bottom-to-top with smaller disks on top.");
      }
      seen.add(disk);
    }
  }

  if (seen.size !== disks) {
    throw new TypeError("Each disk from 1 to the disk count must appear exactly once.");
  }
}

/**
 * Find a shortest legal path from any valid arrangement to peg C.
 * The compact base-3 state encoding keeps the search small (at most 3^10 states).
 *
 * @param {{ A: number[], B: number[], C: number[] }} pegs Starting peg stacks.
 * @param {number} disks Total number of disks.
 * @returns {{ disk: number, from: string, to: string }[]} Shortest move sequence.
 */
export function solveFromState(pegs, disks) {
  validatePegState(pegs, disks);
  const pegIndex = { A: 0, B: 1, C: 2 };
  const pegName = ["A", "B", "C"];
  const powers = Array.from({ length: disks }, (_, disk) => 3 ** disk);
  let start = 0;

  for (const peg of pegName) {
    for (const disk of pegs[peg]) {
      start += pegIndex[peg] * powers[disk - 1];
    }
  }

  const goal = powers.reduce((sum, power) => sum + 2 * power, 0);
  if (start === goal) return [];

  const parents = new Map([[start, null]]);
  const queue = [start];
  let head = 0;

  while (head < queue.length) {
    const state = queue[head];
    head += 1;
    const positions = powers.map((power) => Math.floor(state / power) % 3);
    const topDisks = [0, 0, 0];

    for (let disk = 1; disk <= disks; disk += 1) {
      const peg = positions[disk - 1];
      if (topDisks[peg] === 0) topDisks[peg] = disk;
    }

    for (let from = 0; from < 3; from += 1) {
      const disk = topDisks[from];
      if (disk === 0) continue;

      for (let to = 0; to < 3; to += 1) {
        if (to === from || (topDisks[to] !== 0 && topDisks[to] < disk)) continue;
        const nextState = state + (to - from) * powers[disk - 1];
        if (parents.has(nextState)) continue;

        parents.set(nextState, {
          previous: state,
          move: { disk, from: pegName[from], to: pegName[to] }
        });
        if (nextState === goal) {
          const moves = [];
          let cursor = goal;
          while (cursor !== start) {
            const entry = parents.get(cursor);
            moves.push(entry.move);
            cursor = entry.previous;
          }
          return moves.reverse();
        }
        queue.push(nextState);
      }
    }
  }

  throw new Error("No solution exists for the supplied peg state.");
}
