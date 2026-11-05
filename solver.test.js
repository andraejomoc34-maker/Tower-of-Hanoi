import assert from "node:assert/strict";
import test from "node:test";
import { solveFromState, solveHanoi, validatePegState } from "./solver.js";

test("returns exactly 2^n - 1 moves", () => {
  for (let disks = 1; disks <= 8; disks += 1) {
    assert.equal(solveHanoi(disks).length, 2 ** disks - 1);
  }
});

test("moves every disk to the target peg", () => {
  const disks = 5;
  const moves = solveHanoi(disks);
  const pegs = { A: Array.from({ length: disks }, (_, index) => disks - index), B: [], C: [] };

  for (const move of moves) {
    pegs[move.from].pop();
    pegs[move.to].push(move.disk);
  }

  assert.deepEqual(pegs, { A: [], B: [], C: [5, 4, 3, 2, 1] });
});

test("never makes an illegal move", () => {
  const disks = 6;
  const pegs = { A: Array.from({ length: disks }, (_, index) => disks - index), B: [], C: [] };

  for (const move of solveHanoi(disks)) {
    assert.equal(pegs[move.from].at(-1), move.disk);
    assert.ok(pegs[move.to].length === 0 || pegs[move.to].at(-1) > move.disk);
    pegs[move.from].pop();
    pegs[move.to].push(move.disk);
  }
});

test("supports a single disk and rejects unsupported counts", () => {
  assert.deepEqual(solveHanoi(1), [{ disk: 1, from: "A", to: "C" }]);
  for (const disks of [0, 11, 1.5, Number.NaN]) {
    assert.throws(() => solveHanoi(disks), RangeError);
  }
});

test("solves a custom legal position optimally", () => {
  const startingPegs = { A: [4, 3], B: [2], C: [1] };
  const moves = solveFromState(startingPegs, 4);
  const pegs = structuredClone(startingPegs);

  for (const move of moves) {
    assert.equal(pegs[move.from].at(-1), move.disk);
    assert.ok(pegs[move.to].length === 0 || pegs[move.to].at(-1) > move.disk);
    pegs[move.from].pop();
    pegs[move.to].push(move.disk);
  }

  assert.deepEqual(pegs, { A: [], B: [], C: [4, 3, 2, 1] });
  assert.equal(moves.length, 15);
});

test("validates custom peg state contents and ordering", () => {
  assert.throws(() => validatePegState({ A: [2, 1], B: [], C: [] }, 3), /exactly once/);
  assert.throws(() => validatePegState({ A: [1, 2], B: [3], C: [] }, 3), /bottom-to-top/);
  assert.deepEqual(solveFromState({ A: [], B: [], C: [2, 1] }, 2), []);
});
