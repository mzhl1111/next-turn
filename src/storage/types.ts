export const RUN_SCHEMA_VERSION = 1 as const;

export type RunStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export type RunOutcome =
  | "pass"
  | "fail"
  | "inconclusive"
  | "infrastructure_error";

export interface RunUsage {
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly reasoningTokens?: number;
  readonly costUsd?: number;
}

export interface RunDescriptor {
  readonly source: string;
  readonly sourceIdentity?: string;
  readonly experimentId?: string;
  readonly scenario: { readonly id: string; readonly version: string };
  readonly adapter: { readonly name: string; readonly version?: string };
  readonly simulator: {
    readonly name: string;
    readonly model?: string;
    readonly configuration?: Readonly<Record<string, unknown>>;
  };
  readonly promptHash?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface RunEnvelope extends RunDescriptor {
  readonly schemaVersion: typeof RUN_SCHEMA_VERSION;
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: RunStatus;
  readonly outcome?: RunOutcome;
  readonly terminationReason?: string;
  readonly usage?: RunUsage;
  readonly evaluation?: unknown;
  readonly record?: unknown;
}

export interface RunEvent {
  readonly sequence: number;
  readonly createdAt: string;
  readonly type: string;
  readonly data: unknown;
}

export interface ArtifactReference {
  readonly name: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly mediaType: string;
  readonly visibility: "private" | "shareable";
}

export interface StoredRun {
  readonly run: RunEnvelope;
  readonly events: readonly RunEvent[];
  readonly artifacts: readonly ArtifactReference[];
}

export interface BeginRunInput extends RunDescriptor {
  readonly importKey?: string;
}

export interface AddArtifactInput {
  readonly name: string;
  readonly path: string;
  readonly mediaType?: string;
  readonly visibility?: "private" | "shareable";
  readonly redactJson?: boolean;
}

export interface FinalizeRunInput {
  readonly status: Exclude<RunStatus, "running">;
  readonly outcome: RunOutcome;
  readonly terminationReason?: string;
  readonly usage?: RunUsage;
  readonly evaluation?: unknown;
  readonly record?: unknown;
}

export interface RunListFilter {
  readonly limit?: number;
  readonly source?: string;
  readonly status?: RunStatus;
}

export interface RunSummary {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly source: string;
  readonly scenarioId: string;
  readonly status: RunStatus;
  readonly outcome?: RunOutcome;
}

export interface ImportRunInput {
  readonly importKey: string;
  readonly descriptor: RunDescriptor;
  readonly final: FinalizeRunInput;
  readonly events?: readonly { readonly type: string; readonly data: unknown }[];
  readonly artifacts?: readonly AddArtifactInput[];
}

export interface ImportResult {
  readonly id: string;
  readonly created: boolean;
}

export interface RunStore {
  begin(input: BeginRunInput): Promise<RunEnvelope>;
  appendEvent(id: string, type: string, data: unknown): Promise<RunEvent>;
  checkpoint(id: string, record: unknown): Promise<void>;
  addArtifact(id: string, artifact: AddArtifactInput): Promise<ArtifactReference>;
  finalize(id: string, input: FinalizeRunInput): Promise<RunEnvelope>;
  import(input: ImportRunInput): Promise<ImportResult>;
  interruptRunning(reason: string): Promise<number>;
  get(id: string): Promise<StoredRun | undefined>;
  list(filter?: RunListFilter): Promise<readonly RunSummary[]>;
  readArtifact(id: string, name: string): Promise<Uint8Array>;
  delete(id: string): Promise<boolean>;
  pruneOrphanArtifacts(): Promise<number>;
  backup(destination: string): Promise<void>;
  exportRun(
    id: string,
    destination: string,
    options?: { readonly includePrivate?: boolean },
  ): Promise<void>;
  close(): void;
}
