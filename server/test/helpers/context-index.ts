import { MockGitClient } from '../../src/adapters/mocks.js';
import { FsRepoDocsSource } from '../../src/adapters/repo-docs/fs.js';
import type {
  CloneHead,
  ContextIndexStore,
  IndexJobs,
  ProjectContextLog,
} from '../../src/modules/project-context/ports.js';
import type {
  FailureReason,
  IndexBuild,
  IndexStateRecord,
  ManifestEntry,
} from '../../src/modules/project-context/types.js';

/** In-memory `ContextIndexStore`: replaceIndex is all-or-nothing, like the real transaction. */
export class FakeIndexStore implements ContextIndexStore {
  state: IndexStateRecord | undefined;
  files: ManifestEntry[] = [];
  chunks = new Map<string, IndexBuild['files'][number]['chunks']>();
  replaceCalls = 0;
  failureCalls: FailureReason[] = [];
  /** Make the next replaceIndex throw (a store error). */
  failReplace: Error | undefined;
  readListingCalls = 0;

  async readListing() {
    this.readListingCalls++;
    return { state: this.state, files: this.files };
  }

  async replaceIndex(
    _repoId: string,
    build: IndexBuild,
    indexedAt: Date,
    assertNotCancelled: () => void,
  ): Promise<void> {
    this.replaceCalls++;
    if (this.failReplace) throw this.failReplace;
    // The cancellation check is the last in-transaction statement: if it throws, nothing is committed.
    assertNotCancelled();
    this.files = build.files.map(({ chunks: _c, ...entry }) => entry);
    this.chunks = new Map(build.files.map((f) => [f.path, f.chunks]));
    this.state = {
      status: 'ready',
      indexedAt,
      indexedSha: build.indexedSha,
      glob: build.glob,
      files: build.files.length,
      chunks: build.files.reduce((n, f) => n + f.chunks.length, 0),
      truncated: build.truncated,
      total: build.total,
      failedAt: null,
      failureReason: null,
    };
  }

  async recordFailure(_repoId: string, failedAt: Date, reason: FailureReason): Promise<void> {
    this.failureCalls.push(reason);
    this.state = {
      indexedAt: null,
      indexedSha: null,
      glob: null,
      files: 0,
      chunks: 0,
      truncated: false,
      total: 0,
      ...this.state,
      status: 'failed',
      failedAt,
      failureReason: reason,
    };
  }
}

export class FakeHead implements CloneHead {
  sha: string | Error = 'sha-1';
  async currentHead(): Promise<string> {
    if (this.sha instanceof Error) throw this.sha;
    return this.sha;
  }
}

interface Pending {
  id: string;
  payload: unknown;
  resolve: () => void;
  reject: (e: unknown) => void;
  promise: Promise<void>;
}

/** Controllable `IndexJobs`: nothing runs until the test says so. */
export class FakeJobs implements IndexJobs {
  handlers = new Map<string, (payload: unknown) => Promise<void>>();
  enqueued: { kind: string; payload: unknown }[] = [];
  pending: Pending[] = [];
  /** When set, enqueue rejects with it. */
  enqueueError: Error | undefined;
  private seq = 0;

  register(kind: string, handler: (payload: unknown) => Promise<void>): void {
    this.handlers.set(kind, handler);
  }

  async enqueue(_ws: string, kind: string, payload: unknown) {
    if (this.enqueueError) throw this.enqueueError;
    this.enqueued.push({ kind, payload });
    const id = `job-${++this.seq}`;
    let resolve!: () => void;
    let reject!: (e: unknown) => void;
    const done = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.pending.push({ id, payload, resolve, reject, promise: done });
    return { id, done };
  }

  /** Run the registered handler of the oldest pending job, then settle its `done`. */
  async runNext(kind = 'project_context_index'): Promise<void> {
    const job = this.pending.shift();
    if (!job) throw new Error('no pending job');
    try {
      await this.handlers.get(kind)!(job.payload);
      job.resolve();
    } catch (e) {
      job.reject(e);
      // the service observes `done`; the caller of runNext also sees the handler error as a no-op here
    }
    await job.promise.catch(() => undefined);
    // let the service's onSettled continuation run
    await new Promise((r) => setImmediate(r));
  }

  /** Reject the oldest pending job's `done` without running anything (a JobRunner timeout). */
  async timeoutNext(err: Error): Promise<void> {
    const job = this.pending.shift();
    if (!job) throw new Error('no pending job');
    job.reject(err);
    await job.promise.catch(() => undefined);
    await new Promise((r) => setImmediate(r));
  }
}

/** MockGitClient whose HEAD the test controls and whose clone lands in a real tmp dir. */
export class HeadGit extends MockGitClient {
  head = 'head-1';
  cloneDir: string | undefined;
  override async currentHead(): Promise<string> {
    return this.head;
  }
  override async clone(...args: Parameters<MockGitClient['clone']>): Promise<{ path: string }> {
    const r = await super.clone(...args);
    return { path: this.cloneDir ?? r.path };
  }
}

/** Real-fs docs source (fail-closed reads) with a gate on walk() and an injectable read failure. */
export class ControlDocs extends FsRepoDocsSource {
  /** Holds every walk() open until resolved: a build "in progress". */
  gate: Promise<void> | undefined;
  /** readRaw() of this relative path throws; '*' fails the walk itself. */
  failOn: string | undefined;
  walks = 0;

  holdWalks(): () => void {
    let release!: () => void;
    this.gate = new Promise<void>((r) => (release = r));
    return () => {
      this.gate = undefined;
      release();
    };
  }

  override async walk(...args: Parameters<FsRepoDocsSource['walk']>) {
    this.walks++;
    if (this.gate) await this.gate;
    if (this.failOn === '*') throw new Error('walk failure');
    return super.walk(...args);
  }

  override async readRaw(...args: Parameters<FsRepoDocsSource['readRaw']>) {
    if (this.failOn === args[1]) throw new Error('read failure');
    return super.readRaw(...args);
  }
}

export function spyLog() {
  const warns: { msg: string; data?: unknown }[] = [];
  const infos: { msg: string; data?: unknown }[] = [];
  const log: ProjectContextLog = {
    warn: (msg, data) => warns.push({ msg, data }),
    info: (msg, data) => infos.push({ msg, data }),
  };
  return { log, warns, infos };
}
