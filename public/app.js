import { createAudioEngine } from "./audio.js";

const diskCountControl = document.querySelector("#disk-count");
const speedControl = document.querySelector("#speed");
const solveButton = document.querySelector("#solve-button");
const modeButton = document.querySelector("#mode-button");
const resetButton = document.querySelector("#reset-button");
const pauseButton = document.querySelector("#pause-button");
const resumeButton = document.querySelector("#resume-button");
const stepForwardButton = document.querySelector("#step-forward-button");
const stepBackButton = document.querySelector("#step-back-button");
const hintButton = document.querySelector("#hint-button");
const challengeButton = document.querySelector("#challenge-button");
const muteButton = document.querySelector("#mute-button");
const muteIcon = document.querySelector("#mute-icon");
const muteLabel = document.querySelector("#mute-label");
const moveCountLabel = document.querySelector("#move-count");
const optimalLabel = document.querySelector("#optimal-count");
const timerLabel = document.querySelector("#timer");
const ratingLabel = document.querySelector("#rating");
const statusLabel = document.querySelector("#status");
const hintMessage = document.querySelector("#hint-message");
const errorMessage = document.querySelector("#error-message");
const board = document.querySelector("#board");
const gameCard = document.querySelector(".game-card");
const animationLayer = document.querySelector("#animation-layer");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const audio = createAudioEngine();
const pegNames = ["A", "B", "C"];

let diskCount = Number(diskCountControl.value);
let optimalMoves = 2 ** diskCount - 1;
let completedMoves = 0;
let autoBaseMoves = 0;
let pegs = createInitialPegs(diskCount);
let manualMode = false;
let challengeMode = false;
let selectedDisk = null;
let isSolving = false;
let isPaused = false;
let stepPermits = 0;
let moveBusy = false;
let solutionMoves = [];
let solutionIndex = 0;
let manualHistory = [];
let solveController = null;
let pauseResolver = null;
let pointerDrag = null;
let startedAt = null;
let elapsedBeforePause = 0;
let timerInterval = null;
let activeMoveController = null;

function createInitialPegs(count) {
  return {
    A: Array.from({ length: count }, (_, index) => count - index),
    B: [],
    C: []
  };
}

function createDisk(disk, peg) {
  const element = document.createElement("button");
  const hue = 214 + (diskCount - disk) * 13;
  const width = 39 + ((disk - 1) / Math.max(1, diskCount - 1)) * 38;
  element.type = "button";
  element.className = "disk";
  element.dataset.disk = String(disk);
  element.setAttribute("aria-label", `Disk ${disk} on peg ${peg}; select to move`);
  element.setAttribute("aria-pressed", String(selectedDisk === disk));
  element.style.setProperty("--disk-hue", String(hue));
  element.style.setProperty("--disk-width", `${width}%`);
  element.tabIndex = pegs[peg].at(-1) === disk ? 0 : -1;
  return element;
}

function renderPegs() {
  for (const peg of pegNames) {
    const stack = document.querySelector(`[data-stack="${peg}"]`);
    stack.replaceChildren(...pegs[peg].map((disk) => createDisk(disk, peg)));
  }
}

function setStatus(message) {
  statusLabel.textContent = message;
}

function setMoveCount(current) {
  moveCountLabel.replaceChildren(
    document.createTextNode(String(current)),
    Object.assign(document.createElement("span"), { textContent: ` / ${optimalMoves}` })
  );
}

function formatTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function elapsedTime() {
  return elapsedBeforePause + (startedAt === null ? 0 : performance.now() - startedAt);
}

function renderTimer() {
  timerLabel.textContent = challengeMode
    ? `${formatTime(elapsedTime())} / ${formatTime(parTime())}`
    : formatTime(elapsedTime());
}

function parTime() {
  return Math.max(10_000, optimalMoves * 1_250);
}

function startTimer() {
  if (startedAt !== null) return;
  startedAt = performance.now();
  timerInterval = window.setInterval(renderTimer, 200);
}

function pauseTimer() {
  if (startedAt === null) return;
  elapsedBeforePause += performance.now() - startedAt;
  startedAt = null;
  window.clearInterval(timerInterval);
  timerInterval = null;
  renderTimer();
}

function stopTimer() {
  pauseTimer();
  elapsedBeforePause = 0;
  renderTimer();
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

function clearError() {
  errorMessage.textContent = "";
  errorMessage.hidden = true;
}

function clearHint() {
  hintMessage.textContent = "";
  document.querySelectorAll(".hinted, .hint-target").forEach((element) => {
    element.classList.remove("hinted", "hint-target");
  });
}

function animationDuration() {
  if (reducedMotion.matches) return 70;
  return 440 - (Number(speedControl.value) - 1) * 75;
}

function waitForPhase(duration, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Animation canceled.", "AbortError"));
      return;
    }

    const timeout = window.setTimeout(done, duration + 35);
    function done() {
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
      resolve();
    }
    function cancel() {
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
      reject(new DOMException("Animation canceled.", "AbortError"));
    }
    signal.addEventListener("abort", cancel, { once: true });
  });
}

function transformDisk(element, x, y, duration) {
  element.style.setProperty("--duration", `${duration}ms`);
  element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

/**
 * Animate a move through lift, slide, and lower phases, then update the peg state.
 *
 * @param {{ disk: number, from: string, to: string }} move Legal disk move.
 * @param {AbortSignal} signal Used to cancel animation on reset.
 */
async function animateMove(move, signal) {
  if (signal.aborted) throw new DOMException("Animation canceled.", "AbortError");

  const sourceStack = document.querySelector(`[data-stack="${move.from}"]`);
  const targetStack = document.querySelector(`[data-stack="${move.to}"]`);
  const element = sourceStack.querySelector(`[data-disk="${move.disk}"]`);
  if (!element || sourceStack.lastElementChild !== element) {
    throw new Error("The requested move is not legal in the current position.");
  }

  const boardRect = board.getBoundingClientRect();
  const diskRect = element.getBoundingClientRect();
  const sourceX = diskRect.left - boardRect.left;
  const sourceY = diskRect.top - boardRect.top;
  const diskHeight = diskRect.height;
  const diskWidth = diskRect.width;
  const stackRect = targetStack.getBoundingClientRect();
  const targetX = stackRect.left - boardRect.left + (stackRect.width - diskWidth) / 2;
  const diskGap = window.innerWidth <= 600 ? 2 : 3;
  const targetY =
    stackRect.bottom - boardRect.top - diskHeight -
    pegs[move.to].length * (diskHeight + diskGap);
  const liftY = Math.max(35, boardRect.height * 0.2);
  const duration = animationDuration();

  pegs[move.from].pop();
  animationLayer.append(element);
  element.style.width = `${diskWidth}px`;
  element.style.height = `${diskHeight}px`;
  element.style.transition = "none";
  transformDisk(element, sourceX, sourceY, duration);
  void element.offsetWidth;
  element.style.removeProperty("transition");

  audio.pickup();
  transformDisk(element, sourceX, sourceY - liftY, duration);
  await waitForPhase(duration, signal);

  audio.slide();
  transformDisk(element, targetX, sourceY - liftY, duration);
  await waitForPhase(duration, signal);

  transformDisk(element, targetX, targetY, duration);
  await waitForPhase(duration, signal);

  element.style.removeProperty("width");
  element.style.removeProperty("height");
  element.style.removeProperty("transition");
  element.style.removeProperty("transform");
  element.style.removeProperty("--duration");
  element.classList.add("is-landing");
  targetStack.append(element);
  pegs[move.to].push(move.disk);
  element.addEventListener("animationend", () => element.classList.remove("is-landing"), { once: true });
}

async function requestSolution(signal) {
  const response = await fetch("/api/solve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pegs }),
    signal
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `The server returned ${response.status}.`);
  return result.moves;
}

function finishPuzzle() {
  const stars = completedMoves <= optimalMoves ? 3 : completedMoves <= optimalMoves * 1.5 ? 2 : 1;
  ratingLabel.textContent = `${"★".repeat(stars)}${"☆".repeat(3 - stars)}`;
  ratingLabel.setAttribute("aria-label", `${stars} out of 3 stars`);
  gameCard.classList.add("is-solved");
  setStatus("Solved!");
  if (challengeMode && elapsedTime() <= parTime()) setStatus("Challenge won!");
  pauseTimer();
  audio.victory();
}

function resolvePause() {
  if (pauseResolver) {
    const resume = pauseResolver;
    pauseResolver = null;
    resume();
  }
}

async function runSolution(signal) {
  startTimer();
  while (solutionIndex < solutionMoves.length && !signal.aborted) {
    if (isPaused) {
      if (stepPermits === 0) {
        await new Promise((resolve) => {
          pauseResolver = resolve;
        });
        if (signal.aborted) break;
      }
      if (stepPermits > 0) stepPermits -= 1;
    }

    const move = solutionMoves[solutionIndex];
    moveBusy = true;
    await animateMove(move, signal);
    moveBusy = false;
    solutionIndex += 1;
    completedMoves = autoBaseMoves + solutionIndex;
    manualHistory.push(move);
    renderPegs();
    setMoveCount(completedMoves);
  }

  if (!signal.aborted && solutionIndex === solutionMoves.length) finishPuzzle();
}

async function solvePuzzle() {
  if (isSolving) return;
  clearError();
  clearHint();
  gameCard.classList.remove("is-solved");
  isSolving = true;
  renderMainControls();
  solveController = new AbortController();
  solutionMoves = [];
  solutionIndex = 0;
  autoBaseMoves = completedMoves;

  try {
    await audio.unlock();
    solutionMoves = await requestSolution(solveController.signal);
    isPaused = false;
    setStatus(`Solving · ${solutionMoves.length} moves`);
    renderPlaybackControls();
    if (solutionMoves.length === 0) {
      finishPuzzle();
      return;
    }
    await runSolution(solveController.signal);
  } catch (error) {
    if (error.name !== "AbortError") {
      setStatus("Ready");
      showError(`Could not solve the puzzle: ${error.message}`);
    }
  } finally {
    solveController = null;
    isSolving = false;
    isPaused = false;
    stepPermits = 0;
    moveBusy = false;
    renderMainControls();
    renderPlaybackControls();
  }
}

function renderPlaybackControls() {
  pauseButton.hidden = !isSolving || isPaused;
  resumeButton.hidden = !isSolving || !isPaused;
  stepForwardButton.disabled = moveBusy || !isSolving || !isPaused || solutionIndex >= solutionMoves.length;
  stepBackButton.disabled = moveBusy || (isSolving
    ? !isPaused || solutionIndex === 0
    : !((manualMode && manualHistory.length > 0) || solutionIndex > 0));
}

function renderMainControls() {
  solveButton.disabled = isSolving || moveBusy;
  modeButton.disabled = isSolving || moveBusy;
  diskCountControl.disabled = isSolving;
  hintButton.disabled = !manualMode || isSolving || moveBusy;
}

function pauseSolution() {
  if (!isSolving || isPaused) return;
  isPaused = true;
  pauseTimer();
  setStatus("Paused");
  renderPlaybackControls();
}

function resumeSolution() {
  if (!isSolving || !isPaused) return;
  isPaused = false;
  startTimer();
  setStatus("Solving");
  resolvePause();
  renderPlaybackControls();
}

function stepForward() {
  if (!isSolving || !isPaused || solutionIndex >= solutionMoves.length) return;
  stepPermits += 1;
  resolvePause();
  renderPlaybackControls();
}

async function reverseMove(move, signal) {
  moveBusy = true;
  renderPlaybackControls();
  try {
    await animateMove({ disk: move.disk, from: move.to, to: move.from }, signal);
    renderPegs();
  } finally {
    moveBusy = false;
    renderPlaybackControls();
  }
}

async function stepBack() {
  if (moveBusy) return;

  if (solutionIndex > 0 && (!isSolving || isPaused)) {
    const controller = solveController ?? new AbortController();
    const move = solutionMoves[solutionIndex - 1];
    try {
      await reverseMove(move, controller.signal);
      solutionIndex -= 1;
      manualHistory.pop();
      completedMoves = autoBaseMoves + solutionIndex;
      setMoveCount(completedMoves);
      gameCard.classList.remove("is-solved");
      ratingLabel.textContent = "☆☆☆";
      if (!isSolving) {
        setStatus("Playing");
        startTimer();
      }
      renderPlaybackControls();
    } catch (error) {
      if (error.name !== "AbortError") showError(error.message);
    }
    return;
  }

  if (manualHistory.length > 0 && (manualMode || solutionMoves.length > 0)) {
    const move = manualHistory.at(-1);
    const controller = new AbortController();
    activeMoveController = controller;
    try {
      await reverseMove(move, controller.signal);
      manualHistory.pop();
      completedMoves = Math.max(0, completedMoves - 1);
      setMoveCount(completedMoves);
      gameCard.classList.remove("is-solved");
      ratingLabel.textContent = "☆☆☆";
      if (pegs.C.length !== diskCount) {
        setStatus("Playing");
        startTimer();
      }
      renderPlaybackControls();
    } catch (error) {
      if (error.name !== "AbortError") showError(error.message);
    } finally {
      if (activeMoveController === controller) activeMoveController = null;
    }
  }
}

function selectDisk(disk, peg) {
  if (!manualMode || isSolving || moveBusy || pegs[peg].at(-1) !== disk) return;
  void audio.unlock().catch((error) => showError(`Audio could not start: ${error.message}`));
  selectedDisk = disk;
  document.querySelectorAll(".disk").forEach((element) => {
    const selected = Number(element.dataset.disk) === disk;
    element.classList.toggle("is-selected", selected);
    element.setAttribute("aria-pressed", String(selected));
  });
  setStatus(`Disk ${disk} selected`);
}

function shakeBoard() {
  board.classList.remove("illegal-shake");
  void board.offsetWidth;
  board.classList.add("illegal-shake");
  board.addEventListener("animationend", () => board.classList.remove("illegal-shake"), { once: true });
}

async function attemptManualMove(targetPeg) {
  if (!manualMode || isSolving || moveBusy || selectedDisk === null) return;
  const sourcePeg = pegNames.find((peg) => pegs[peg].at(-1) === selectedDisk);
  if (!sourcePeg) {
    selectedDisk = null;
    return;
  }
  if (sourcePeg === targetPeg) {
    selectedDisk = null;
    renderPegs();
    return;
  }

  const targetTop = pegs[targetPeg].at(-1);
  if (targetTop !== undefined && targetTop < selectedDisk) {
    shakeBoard();
    audio.illegal();
    setStatus("Illegal move");
    return;
  }

  const move = { disk: selectedDisk, from: sourcePeg, to: targetPeg };
  selectedDisk = null;
  clearHint();
  const controller = new AbortController();
  activeMoveController = controller;
  moveBusy = true;
  renderMainControls();
  renderPlaybackControls();
  startTimer();
  try {
    await audio.unlock();
    await animateMove(move, controller.signal);
    moveBusy = false;
    manualHistory.push(move);
    solutionMoves = [];
    solutionIndex = 0;
    autoBaseMoves = 0;
    completedMoves += 1;
    renderPegs();
    setMoveCount(completedMoves);
    renderPlaybackControls();
    if (pegs.C.length === diskCount) finishPuzzle();
    else setStatus("Playing");
  } catch (error) {
    moveBusy = false;
    if (error.name !== "AbortError") showError(error.message);
  } finally {
    if (activeMoveController === controller) activeMoveController = null;
    renderMainControls();
    renderPlaybackControls();
  }
}

async function showHint() {
  if (isSolving || !manualMode) return;
  clearError();
  clearHint();
  const startingState = JSON.stringify(pegs);
  hintButton.disabled = true;
  try {
    const moves = await requestSolution(new AbortController().signal);
    if (isSolving || !manualMode || JSON.stringify(pegs) !== startingState) return;
    if (moves.length === 0) {
      hintMessage.textContent = "The puzzle is already solved.";
      return;
    }
    const move = moves[0];
    const sourceStack = document.querySelector(`[data-stack="${move.from}"]`);
    sourceStack.querySelector(`[data-disk="${move.disk}"]`)?.classList.add("hinted");
    document.querySelector(`[data-peg="${move.to}"]`)?.classList.add("hint-target");
    hintMessage.textContent = `Hint: move disk ${move.disk} from ${move.from} to ${move.to}.`;
  } catch (error) {
    showError(`Could not load a hint: ${error.message}`);
  } finally {
    renderMainControls();
  }
}

function toggleMode() {
  if (isSolving) return;
  manualMode = !manualMode;
  selectedDisk = null;
  clearHint();
  renderPegs();
  modeButton.classList.toggle("is-active", manualMode);
  modeButton.setAttribute("aria-pressed", String(manualMode));
  modeButton.setAttribute("aria-label", manualMode ? "Exit play mode" : "Play the puzzle yourself");
  modeButton.querySelector("span:last-child").textContent = manualMode ? "Exit play mode" : "Play yourself";
  solveButton.querySelector("span:last-child").textContent = manualMode ? "Auto solve" : "Solve puzzle";
  renderMainControls();
  setStatus(manualMode ? "Your turn" : "Ready");
}

function toggleChallenge() {
  challengeMode = !challengeMode;
  challengeButton.classList.toggle("is-active", challengeMode);
  challengeButton.setAttribute("aria-pressed", String(challengeMode));
  challengeButton.setAttribute(
    "aria-label",
    challengeMode ? "Disable beat the par challenge" : "Enable beat the par challenge"
  );
  challengeButton.querySelector("span:last-child").textContent = challengeMode ? "Challenge on" : "Beat the par";
  renderTimer();
}

function resetPuzzle() {
  if (solveController) solveController.abort();
  if (activeMoveController) activeMoveController.abort();
  resolvePause();
  pegs = createInitialPegs(diskCount);
  selectedDisk = null;
  completedMoves = 0;
  optimalMoves = 2 ** diskCount - 1;
  solutionMoves = [];
  solutionIndex = 0;
  autoBaseMoves = 0;
  manualHistory = [];
  isPaused = false;
  stepPermits = 0;
  animationLayer.replaceChildren();
  renderPegs();
  setMoveCount(0);
  optimalLabel.textContent = `OPTIMAL · ${optimalMoves}`;
  ratingLabel.textContent = "☆☆☆";
  ratingLabel.setAttribute("aria-label", "0 out of 3 stars");
  stopTimer();
  setStatus(manualMode ? "Your turn" : "Ready");
  gameCard.classList.remove("is-solved");
  clearError();
  clearHint();
  renderMainControls();
  renderPlaybackControls();
}

function changeDiskCount() {
  diskCount = Number(diskCountControl.value);
  resetPuzzle();
}

function toggleMute() {
  const nextMuted = !audio.isMuted();
  audio.setMuted(nextMuted);
  muteButton.setAttribute("aria-pressed", String(nextMuted));
  muteButton.setAttribute("aria-label", nextMuted ? "Unmute sounds" : "Mute sounds");
  muteIcon.textContent = nextMuted ? "♩" : "♫";
  muteLabel.textContent = nextMuted ? "Sound off" : "Sound on";
  if (!nextMuted) {
    void audio.unlock().catch((error) => showError(`Audio could not start: ${error.message}`));
  }
}

board.addEventListener("click", (event) => {
  if (event.target.closest(".disk")) {
    const element = event.target.closest(".disk");
    const peg = element.closest(".peg-column")?.dataset.peg;
    if (peg && selectedDisk !== null) {
      const sourcePeg = pegNames.find((name) => pegs[name].at(-1) === selectedDisk);
      if (sourcePeg && sourcePeg !== peg) {
        void attemptManualMove(peg);
        return;
      }
    }
    if (peg) selectDisk(Number(element.dataset.disk), peg);
    return;
  }

  const pegColumn = event.target.closest(".peg-column");
  if (pegColumn) void attemptManualMove(pegColumn.dataset.peg);
});

board.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const pegColumn = event.target.closest(".peg-column");
  if (!pegColumn) return;
  event.preventDefault();
  void attemptManualMove(pegColumn.dataset.peg);
});

board.addEventListener("pointerdown", (event) => {
  const element = event.target.closest(".disk");
  const peg = element?.closest(".peg-column")?.dataset.peg;
  if (!element || !peg || !manualMode || isSolving || moveBusy) return;
  const disk = Number(element.dataset.disk);
  if (pegs[peg].at(-1) !== disk) return;
  pointerDrag = { element, disk, startX: event.clientX, startY: event.clientY, moved: false };
  selectDisk(disk, peg);
  element.setPointerCapture(event.pointerId);
});

board.addEventListener("pointermove", (event) => {
  if (!pointerDrag) return;
  const deltaX = event.clientX - pointerDrag.startX;
  const deltaY = event.clientY - pointerDrag.startY;
  if (!pointerDrag.moved && Math.hypot(deltaX, deltaY) > 8) pointerDrag.moved = true;
  if (pointerDrag.moved) {
    pointerDrag.element.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;
    pointerDrag.element.classList.add("is-dragging");
  }
});

board.addEventListener("pointerup", (event) => {
  if (!pointerDrag) return;
  const drag = pointerDrag;
  pointerDrag = null;
  drag.element.style.removeProperty("transform");
  drag.element.classList.remove("is-dragging");
  if (drag.moved) {
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".peg-column");
    if (target) void attemptManualMove(target.dataset.peg);
  }
});

board.addEventListener("pointercancel", () => {
  if (!pointerDrag) return;
  pointerDrag.element.style.removeProperty("transform");
  pointerDrag.element.classList.remove("is-dragging");
  pointerDrag = null;
});

solveButton.addEventListener("click", solvePuzzle);
modeButton.addEventListener("click", toggleMode);
resetButton.addEventListener("click", resetPuzzle);
pauseButton.addEventListener("click", pauseSolution);
resumeButton.addEventListener("click", resumeSolution);
stepForwardButton.addEventListener("click", stepForward);
stepBackButton.addEventListener("click", stepBack);
hintButton.addEventListener("click", showHint);
challengeButton.addEventListener("click", toggleChallenge);
diskCountControl.addEventListener("change", changeDiskCount);
muteButton.addEventListener("click", toggleMute);
renderPegs();
setMoveCount(0);
optimalLabel.textContent = `OPTIMAL · ${optimalMoves}`;
ratingLabel.setAttribute("aria-label", "0 out of 3 stars");
renderTimer();
renderMainControls();
renderPlaybackControls();
