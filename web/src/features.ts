// UI mode, chosen at build time.
//   simple (default): Артикул, Фото, Наименование, Количество — see pages/simple/*.
//   full: categories, monthly counts, opening qty, prices, shortage/write-off sums — pages/Inventory, ItemPage, Categories.
// The backend and database always support everything; the mode only decides what the panel shows.
// Enable the full UI with:  VITE_INVENTORY_MODE=full npm run web:build
export const FULL_MODE = import.meta.env.VITE_INVENTORY_MODE === 'full';
