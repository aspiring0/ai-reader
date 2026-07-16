/**
 * SP3 Compatibility Detector
 *
 * Classifies a GitHub repo into one of 6 tiers (A-F) based on:
 * - Presence and validity of SKILL.md
 * - Topics signaling ecosystem (codex, claude-code, mcp, cursor-rules)
 * - package.json scripts indicating MCP server
 */

/** A file entry from GitHub Contents API. */
export interface RepoFile {
  name: string;
  type: string; // 'file' | 'dir'
  path: string;
}

/** Repo-level metadata extracted from raw_data. */
export interface RepoMeta {
  topics: string[];
  fullName: string;
  url: string;
  description: string;
}

/** Result of compatibility classification. */
export interface CompatibilityResult {
  tier: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  installable: boolean;
  skillName: string | null;
  skillDescription: string | null;
  label: string;
  reason: string;
}

const TIER_LABELS: Record<CompatibilityResult['tier'], string> = {
  A: 'Ready to install (Codex)',
  B: 'Compatible (standard SKILL.md format)',
  C: 'Needs wrapping (invalid SKILL.md frontmatter)',
  D: 'Not a skill (standalone app)',
  E: 'MCP Server (manual config required)',
  F: 'Incompatible format',
};

/** Check if SKILL.md frontmatter has valid name + description. */
function validateFrontmatter(content: string): { valid: boolean; name: string | null; description: string | null } {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return { valid: false, name: null, description: null };

  const fm = fmMatch[1];
  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  const descMatch = fm.match(/^description:\s*(.+)$/m);

  const name = nameMatch ? nameMatch[1].trim() : null;
  const description = descMatch ? descMatch[1].trim() : null;

  return {
    valid: !!(name && description),
    name,
    description,
  };
}

/** Check if topics contain MCP signals (even without explicit mcp topic). */
function isMcpPackageJson(pkgJson: string): boolean {
  try {
    const pkg = JSON.parse(pkgJson);
    const name = (pkg.name || '').toLowerCase();
    const binKeys = pkg.bin ? Object.keys(pkg.bin) : [];
    const scripts = pkg.scripts || {};
    return (
      name.includes('mcp') ||
      binKeys.some(k => k.includes('mcp')) ||
      Object.keys(scripts).some(k => k.includes('mcp'))
    );
  } catch {
    return false;
  }
}

/**
 * Classify a repo's compatibility with the Codex skill system.
 *
 * @param files - Root-level file listing from GitHub Contents API
 * @param meta - Repo metadata (topics, name, url, description)
 * @param fetchSkillMd - Async function that returns SKILL.md content (or null)
 * @param fetchPackageJson - Optional async function for package.json content
 */
export async function classifyCompatibility(
  files: RepoFile[],
  meta: RepoMeta,
  fetchSkillMd: () => Promise<string | null>,
  fetchPackageJson?: () => Promise<string | null>,
): Promise<CompatibilityResult> {
  const hasSkillMd = files.some(f => f.name === 'SKILL.md' && f.type === 'file');
  const topics = meta.topics.map(t => t.toLowerCase());

  // Path 1: SKILL.md exists
  if (hasSkillMd) {
    const skillContent = await fetchSkillMd();

    if (skillContent) {
      const { valid, name, description } = validateFrontmatter(skillContent);

      if (valid) {
        // Tier A: valid frontmatter + codex/codex-skill topic
        const isCodex = topics.includes('codex') || topics.includes('codex-skill');
        const tier = isCodex ? 'A' : 'B';
        return {
          tier,
          installable: true,
          skillName: name,
          skillDescription: description,
          label: TIER_LABELS[tier],
          reason: isCodex
            ? 'Has valid SKILL.md with Codex ecosystem topics'
            : 'Has valid SKILL.md (non-Codex ecosystem, format compatible)',
        };
      }

      // Tier C: SKILL.md exists but frontmatter invalid
      return {
        tier: 'C',
        installable: false,
        skillName: null,
        skillDescription: null,
        label: TIER_LABELS.C,
        reason: 'SKILL.md exists but frontmatter is missing name or description',
      };
    }
  }

  // Path 2: No SKILL.md - check for MCP signals
  const hasMcpTopic = topics.includes('mcp');

  // Check package.json for MCP server patterns
  let hasMcpInPkg = false;
  if (!hasMcpTopic && fetchPackageJson) {
    const hasPkgJson = files.some(f => f.name === 'package.json');
    if (hasPkgJson) {
      const pkgContent = await fetchPackageJson();
      if (pkgContent) {
        hasMcpInPkg = isMcpPackageJson(pkgContent);
      }
    }
  }

  if (hasMcpTopic || hasMcpInPkg) {
    return {
      tier: 'E',
      installable: false,
      skillName: null,
      skillDescription: null,
      label: TIER_LABELS.E,
      reason: hasMcpTopic ? 'Has MCP topic' : 'package.json indicates MCP server',
    };
  }

  // Check for cursor-rules / prompt-only repos
  const isCursorOrPrompt = topics.some(t =>
    t.includes('cursor') || t.includes('cursor-rules') || t.includes('prompt'),
  );

  if (isCursorOrPrompt) {
    return {
      tier: 'F',
      installable: false,
      skillName: null,
      skillDescription: null,
      label: TIER_LABELS.F,
      reason: 'Topics suggest Cursor rules or prompt templates, not a Codex skill',
    };
  }

  // Default: Tier D (standalone app, not a skill)
  return {
    tier: 'D',
    installable: false,
    skillName: null,
    skillDescription: null,
    label: TIER_LABELS.D,
    reason: 'No SKILL.md found, appears to be a standalone application',
  };
}
