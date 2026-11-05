/**
 * Fetch a solution from the same origin as the app.
 *
 * @param {number} disks Requested disk count.
 * @returns {Promise<{ disks: number, totalMoves: number, moves: { disk: number, from: string, to: string }[] }>}
 */
export async function fetchSolution(disks, signal) {
  const response = await fetch(`/api/solve?disks=${encodeURIComponent(disks)}`, { signal });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `The server returned ${response.status}.`);
  }

  return result;
}
