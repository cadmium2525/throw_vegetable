/** Shared geometry for the expanded fictional city: metres, not damage ranges. */
export const DISTRICT_CROSS_STREETS = [-33, -61, -89] as const;
export const DISTRICT_AVENUES = [-80, -52, -24, 24, 52, 80] as const;
export const DISTRICT_BUILDINGS = (() => {
  const buildings: { id: string; x: number; z: number; width: number; depth: number; height: number; style: number }[] = [];
  for (const side of [-1, 1]) for (let column = 0; column < 6; column++) for (let row = 0; row < 8; row++) {
    // Pocket parks occupy four real gaps in the grid.
    if ((column === 2 || column === 4) && row === 3) continue;
    const x = side * [16, 32, 43, 60, 71, 88][column];
    const width = [8, 8, 10, 8, 10, 8][column];
    const height = column === 0 ? 5 + row % 3 * 2 : 8 + ((row * 7 + column * 3 + (side + 1)) % 6) * 3;
    buildings.push({ id: `wall-district-${side}-${column}-${row}`, x, z: 2 - row * 14, width, depth: 10, height, style: (row + column) % 4 });
  }
  return buildings;
})();
export const CITY_BUILDING_COUNT = 16 + DISTRICT_BUILDINGS.length;
