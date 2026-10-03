// Opening / closing checklist templates. Applying one creates a set of staff tasks. Kept generic
// (a corner-shop baseline); shop-type-specific variants can be added later.
export const CHECKLIST_TEMPLATES = [
  {
    id: 'opening',
    label: 'Opening checklist',
    category: 'opening',
    items: [
      'Turn on lights, signs & chillers — check temperatures',
      'Count & set the till float',
      'Check fridges/freezers are cold (log temps)',
      'Pull anything past its date from the shelves',
      'Face up shelves & fill obvious gaps',
      'Check newspapers/deliveries have arrived',
    ],
  },
  {
    id: 'closing',
    label: 'Closing checklist',
    category: 'closing',
    items: [
      'Cash up & record the day’s takings',
      'Mark down or pull short-dated stock',
      'Empty bins & tidy the shop floor',
      'Secure alcohol/tobacco & lock the back',
      'Note anything to hand over to the next shift',
      'Set the alarm & lock up',
    ],
  },
];

export function getChecklist(id) {
  return CHECKLIST_TEMPLATES.find((t) => t.id === id) || null;
}
