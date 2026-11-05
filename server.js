import cors from "cors";
import express from "express";
import { fileURLToPath } from "node:url";
import { solveFromState, solveHanoi } from "./solver.js";

const app = express();
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const publicDirectory = fileURLToPath(new URL("./public/", import.meta.url));

app.use((request, response, next) => {
  const startedAt = process.hrtime.bigint();
  response.on("finish", () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    console.log(
      `${request.method} ${request.originalUrl} ${response.statusCode} ${elapsedMs.toFixed(1)}ms`
    );
  });
  next();
});

app.use(cors());
app.use(express.json({ limit: "16kb" }));
app.use(express.static(publicDirectory));

app.get("/api/solve", (request, response) => {
  const rawDisks = request.query.disks;
  const disks = typeof rawDisks === "string" ? Number(rawDisks) : Number.NaN;

  if (!Number.isInteger(disks) || disks < 1 || disks > 10) {
    response.status(400).json({ error: "disks must be an integer from 1 to 10." });
    return;
  }

  const moves = solveHanoi(disks);
  response.json({ disks, totalMoves: moves.length, moves });
});

app.post("/api/solve", (request, response, next) => {
  try {
    const pegs = request.body?.pegs;
    if (!pegs || typeof pegs !== "object" || Array.isArray(pegs)) {
      response.status(400).json({ error: "Request body must include a pegs object." });
      return;
    }

    const disks = Object.values(pegs).reduce(
      (count, stack) => count + (Array.isArray(stack) ? stack.length : 0),
      0
    );
    const moves = solveFromState(pegs, disks);
    response.json({ disks, totalMoves: moves.length, moves });
  } catch (error) {
    if (error instanceof RangeError || error instanceof TypeError) {
      response.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

app.use((error, request, response, next) => {
  console.error("Request failed:", error);
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error.type === "entity.parse.failed") {
    response.status(400).json({ error: "Request body must be valid JSON." });
    return;
  }
  if (error.type === "entity.too.large") {
    response.status(413).json({ error: "Request body is too large." });
    return;
  }

  response.status(500).json({ error: "An unexpected server error occurred." });
});

app.listen(port, () => {
  console.log(`Tower of Hanoi is listening on http://localhost:${port}`);
});
