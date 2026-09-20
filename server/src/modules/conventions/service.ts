import type { Skill } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { RepoRepository, type RepoRow } from '../repos/repository.js';
import { SkillsRepository } from '../skills/repository.js';
import { toSkillDto } from '../skills/helpers.js';
import { getFeatureModelOverride } from '../settings/feature-models.js';
import {
  CONFIG_FILE_CANDIDATES,
  DEFAULT_CONVENTIONS_MODEL,
  DEFAULT_CONVENTIONS_PROVIDER,
  EXTRACTION_SCHEMA_NAME,
  MAX_CHARS_TOTAL,
  SAMPLE_FILE_COUNT,
} from './constants.js';
import {
  buildSkillBody,
  isSafeRelativePath,
  numberLines,
  ruleKey,
  toConventionDto,
  verifyEvidence,
} from './helpers.js';
import { buildExtractionMessages } from './prompt.js';
import { ConventionsRepository, type InsertConvention } from './repository.js';
import {
  ConventionExtraction,
  type ConventionDto,
  type ConventionList,
  type ConventionPatch,
  type CreateSkillBody,
} from './schemas.js';

interface SampleFile {
  path: string;
  content: string;
}

/**
 * Conventions extractor. Samples are picked by code (configs + top-ranked files),
 * a cheap model proposes candidates, and every candidate's evidence is verified
 * against the real file before it is stored — unverifiable ones are dropped.
 */
export class ConventionsService {
  private repo: ConventionsRepository;
  private repos: RepoRepository;
  private skills: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
    this.repos = new RepoRepository(container.db);
    this.skills = new SkillsRepository(container.db);
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionList> {
    const repo = await this.requireRepo(workspaceId, repoId);
    return this.respond(workspaceId, repo);
  }

  async extract(workspaceId: string, repoId: string): Promise<ConventionList> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const samples = await this.collectSamples(repo);
    if (samples.length === 0) {
      throw new ValidationError('No files to analyse — sync the repository first');
    }

    const override = await getFeatureModelOverride(this.container, workspaceId, 'conventions');
    const choice = override ?? {
      provider: DEFAULT_CONVENTIONS_PROVIDER,
      model: DEFAULT_CONVENTIONS_MODEL,
    };
    const llm = await this.container.llm(choice.provider);
    const result = await llm.completeStructured({
      model: choice.model,
      schema: ConventionExtraction,
      schemaName: EXTRACTION_SCHEMA_NAME,
      messages: buildExtractionMessages(samples),
      temperature: 0,
    });

    const fresh = await this.verifyCandidates(workspaceId, repo, result.data);

    // Re-scan starts from a clean slate: previously accepted candidates are dropped too.
    await this.repo.deleteAll(workspaceId, repo.id);
    await this.repo.insertMany(fresh);

    return this.respond(workspaceId, repo);
  }

  async update(workspaceId: string, id: string, patch: ConventionPatch): Promise<ConventionDto> {
    const row = await this.repo.update(workspaceId, id, patch);
    if (!row) throw new NotFoundError('Convention not found');
    return toConventionDto(row);
  }

  async reject(workspaceId: string, id: string): Promise<void> {
    if (!(await this.repo.delete(workspaceId, id))) throw new NotFoundError('Convention not found');
  }

  /** Merge accepted conventions into one skill. Rejected ones no longer exist, pending ones are ignored. */
  async createSkill(workspaceId: string, repoId: string, input: CreateSkillBody): Promise<Skill> {
    await this.requireRepo(workspaceId, repoId);
    const rows = (await this.repo.getMany(workspaceId, repoId, input.convention_ids)).filter(
      (r) => r.accepted,
    );
    if (rows.length === 0) throw new ValidationError('Accept at least one convention first');

    const evidenceFiles = [...new Set(rows.map((r) => r.evidencePath).filter((p): p is string => !!p))];
    const skill = await this.skills.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: 'convention',
      source: 'extracted',
      body: input.body ?? buildSkillBody(rows),
      enabled: true,
      evidenceFiles,
    });
    return toSkillDto(skill);
  }

  // ---------------------------------------------------------------- internals

  private async requireRepo(workspaceId: string, repoId: string): Promise<RepoRow> {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }

  private async respond(workspaceId: string, repo: RepoRow): Promise<ConventionList> {
    const rows = await this.repo.listByRepo(workspaceId, repo.id);
    return { head_sha: await this.headSha(repo), conventions: rows.map(toConventionDto) };
  }

  private async headSha(repo: RepoRow): Promise<string> {
    try {
      return await this.container.git.currentHead({ owner: repo.owner, name: repo.name });
    } catch {
      return repo.defaultBranch;
    }
  }

  /** Step 1 — no AI: root configs that exist + the top-ranked source files, line-numbered. */
  private async collectSamples(repo: RepoRow): Promise<SampleFile[]> {
    const ref = { owner: repo.owner, name: repo.name };
    const ranked = await this.container.repoIntel.getConventionSamples(repo.id, SAMPLE_FILE_COUNT);
    const paths = [...CONFIG_FILE_CANDIDATES, ...ranked];

    const out: SampleFile[] = [];
    let total = 0;
    for (const path of paths) {
      if (total >= MAX_CHARS_TOTAL) break;
      try {
        const content = await this.container.git.readFile(ref, path);
        if (!content.trim()) continue;
        const numbered = numberLines(content);
        total += numbered.length;
        out.push({ path, content: numbered });
      } catch {
        // config not present in this repo — skip
      }
    }
    return out;
  }

  /** Step 3 — drop every candidate whose file/line evidence can't be confirmed in the real file. */
  private async verifyCandidates(
    workspaceId: string,
    repo: RepoRow,
    extraction: ConventionExtraction,
  ): Promise<InsertConvention[]> {
    const ref = { owner: repo.owner, name: repo.name };
    const cache = new Map<string, string | null>();
    const readReal = async (path: string): Promise<string | null> => {
      if (cache.has(path)) return cache.get(path)!;
      let content: string | null = null;
      if (isSafeRelativePath(path)) {
        try {
          content = await this.container.git.readFile(ref, path);
        } catch {
          content = null;
        }
      }
      cache.set(path, content);
      return content;
    };

    const seen = new Set<string>();
    const out: InsertConvention[] = [];
    for (const c of extraction.conventions) {
      const content = await readReal(c.evidence.file);
      if (content === null) continue;
      const verified = verifyEvidence(content, c.evidence.line, c.evidence.code);
      if (!verified) continue;
      const key = ruleKey(c.rule, c.evidence.file);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        workspaceId,
        repoId: repo.id,
        rule: c.rule.trim(),
        evidencePath: c.evidence.file,
        evidenceSnippet: verified.snippet,
        evidenceLine: verified.line,
        confidence: c.confidence,
      });
    }
    return out;
  }
}
