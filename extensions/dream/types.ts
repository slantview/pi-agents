export const DREAM_POLICY_VERSION = "1";

export type DreamMemoryType = "decision" | "requirement" | "architecture" | "error" | "note" | "prompt";
export type DreamConfidence = "high" | "medium" | "low";
export type DreamMappingBasis = "captured" | "legacy-current-remote";

export interface DreamInsight {
  type: DreamMemoryType;
  title: string;
  content: string;
  confidence: DreamConfidence;
  tags: string[];
  evidenceSessionHashes: string[];
  verification: string[];
}

export interface DreamProjectReport {
  project: string;
  repository: string;
  mappingBasis: DreamMappingBasis;
  sessionCount: number;
  inputBytes: number;
  redactions: number;
  insights: DreamInsight[];
}

export interface DreamReport {
  schemaVersion: 1;
  generatedAt: string;
  distiller: { provider: string; model: string };
  projects: DreamProjectReport[];
  digest: string;
}

export interface DreamProjectMapping {
  project: string;
  repository: string;
  capturedAt: string;
}

export interface DreamAnalysisRecord {
  project: string;
  analyzedAt: string;
  reportDigest: string;
}

export interface DreamLedger {
  version: 1;
  lastReminderAt?: string;
  projectMappings: Record<string, DreamProjectMapping>;
  analyses: Record<string, DreamAnalysisRecord>;
}

export interface DreamSessionHeader {
  path: string;
  id: string;
  cwd: string;
  createdAt: string;
  modifiedMs: number;
  size: number;
  dev: string;
  ino: string;
  mtimeNs: string;
  headerBytesRead: number;
}

export interface DreamSelectedSession extends DreamSessionHeader {
  identityHash: string;
  analysisKey: string;
  mapping: DreamProjectMapping;
}

export interface DreamSnapshotMessage {
  role: "user" | "assistant";
  text: string;
}

export interface DreamSessionSnapshot {
  status: "ok";
  messages: DreamSnapshotMessage[];
  providers: string[];
  redactions: number;
  inputBytes: number;
  inputDigest: string;
}

export type DreamSnapshotResult = DreamSessionSnapshot | {
  status: "skipped";
  reason: string;
};
