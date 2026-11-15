// Returns screen rectangles as fractions of the window, with the origin at the top left.
// Three players leave the fourth quarter for an overview of the whole race.
export function viewports(players) {
  if (players === 1) return [{ x: 0, y: 0, w: 1, h: 1 }];
  if (players === 2) {
    return [
      { x: 0, y: 0, w: 1, h: 0.5 },
      { x: 0, y: 0.5, w: 1, h: 0.5 },
    ];
  }
  const quarters = [0, 1, 2, 3].map((i) => ({ x: (i % 2) * 0.5, y: Math.floor(i / 2) * 0.5, w: 0.5, h: 0.5 }));
  if (players === 3) quarters[3].overview = true;
  return quarters;
}
