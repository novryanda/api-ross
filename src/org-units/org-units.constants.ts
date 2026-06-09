export const ORG_UNIT_PIC_ASSIGNED_FILTERS = [
  'ASSIGNED',
  'UNASSIGNED',
] as const;

export type OrgUnitPicAssignedFilter =
  (typeof ORG_UNIT_PIC_ASSIGNED_FILTERS)[number];

export const ORG_UNIT_VIEW_MODES = ['flat', 'tree'] as const;

export type OrgUnitViewMode = (typeof ORG_UNIT_VIEW_MODES)[number];

export const OrgUnitPicAssignedFilter = {
  ASSIGNED: 'ASSIGNED',
  UNASSIGNED: 'UNASSIGNED',
} as const satisfies Record<string, OrgUnitPicAssignedFilter>;

export const OrgUnitViewMode = {
  FLAT: 'flat',
  TREE: 'tree',
} as const satisfies Record<string, OrgUnitViewMode>;
