import { Schema, model, models } from 'mongoose';

/**
 * Head of one audit hash chain (#1494). There is one chain per clinic plus a
 * `global` chain for entries without a clinic. `seq`/`hash` always describe the
 * most recently appended entry and are advanced with a compare-and-swap on
 * `seq`, so concurrent writers (across API replicas) can never fork a chain.
 */
export interface AuditChainHead {
  chainId: string;
  seq: number;
  hash: string;
  updatedAt: Date;
}

const auditChainHeadSchema = new Schema<AuditChainHead>(
  {
    chainId: { type: String, required: true, unique: true },
    seq: { type: Number, required: true },
    hash: { type: String, required: true },
    updatedAt: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false, collection: 'audit_chain_heads' }
);

export const AuditChainHeadModel = (models.AuditChainHead ||
  model<AuditChainHead>(
    'AuditChainHead',
    auditChainHeadSchema
  )) as import('mongoose').Model<AuditChainHead>;

/** Daily on-chain anchor of every chain head, for proof outside our database. */
export interface AuditChainAnchor {
  anchorDate: string; // YYYY-MM-DD (UTC)
  rootHash: string; // SHA-256 over the sorted chain heads below
  heads: { chainId: string; seq: number; hash: string }[];
  transactionHash?: string;
  status: 'ANCHORED' | 'FAILED';
  error?: string;
  createdAt: Date;
}

const auditChainAnchorSchema = new Schema<AuditChainAnchor>(
  {
    anchorDate: { type: String, required: true, unique: true },
    rootHash: { type: String, required: true },
    heads: [
      {
        _id: false,
        chainId: { type: String, required: true },
        seq: { type: Number, required: true },
        hash: { type: String, required: true },
      },
    ],
    transactionHash: { type: String },
    status: { type: String, enum: ['ANCHORED', 'FAILED'], required: true },
    error: { type: String },
    createdAt: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false, collection: 'audit_chain_anchors' }
);

export const AuditChainAnchorModel = (models.AuditChainAnchor ||
  model<AuditChainAnchor>(
    'AuditChainAnchor',
    auditChainAnchorSchema
  )) as import('mongoose').Model<AuditChainAnchor>;
