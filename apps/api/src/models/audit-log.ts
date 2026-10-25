import { model, Schema } from 'mongoose';

// Append-only record of changes to transactions and budgets.
const auditLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true, enum: ['create', 'update', 'delete', 'restore'] },
    entity: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    requestId: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });

export const AuditLogModel = model('AuditLog', auditLogSchema);

export type AuditAction = 'create' | 'update' | 'delete' | 'restore';

export async function writeAudit(input: {
  actorId: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  requestId?: string;
}): Promise<void> {
  await AuditLogModel.create(input);
}
