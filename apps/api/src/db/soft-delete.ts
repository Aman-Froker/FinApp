import type { Schema } from 'mongoose';

export type SoftDeletable = { deletedAt: Date | null };

// Financial records are never hard-deleted. Reads exclude deleted rows unless the
// query sets `withDeleted: true` in its options.
export function softDeletePlugin(schema: Schema): void {
  schema.add({ deletedAt: { type: Date, default: null, index: true } });
  const exclude = function (this: { getOptions(): { withDeleted?: boolean }; where(c: object): unknown }) {
    if (!this.getOptions().withDeleted) this.where({ deletedAt: null });
  };
  for (const hook of ['find', 'findOne', 'countDocuments', 'findOneAndUpdate', 'updateOne', 'updateMany'] as const) {
    schema.pre(hook, exclude);
  }
}
