export type FinancePaletteCommand = {
  id: string;
  label: string;
  route: string;
  kind: 'navigation' | 'action';
};

function normalizeSearchValue(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim();
}

export function filterFinancePaletteCommands(
  commands: readonly FinancePaletteCommand[],
  query: string,
) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return [...commands];

  return commands.filter((command) =>
    normalizeSearchValue(command.label).includes(normalizedQuery),
  );
}

export function moveFinancePaletteSelection(
  currentIndex: number,
  total: number,
  direction: 1 | -1,
) {
  if (total <= 0) return -1;
  if (currentIndex < 0 || currentIndex >= total) {
    return direction === 1 ? 0 : total - 1;
  }

  return (currentIndex + direction + total) % total;
}
