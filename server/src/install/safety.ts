/**
 * SP3 Safety Scanner
 *
 * 5-stage pipeline for pre-install security assessment of Codex skills:
 * S1: File inventory audit (binaries, size)
 * S2: Metadata validation (SKILL.md frontmatter)
 * S3: Static pattern scan (dangerous APIs in executable files)
 * S4: Domain reference check (non-HTTPS, unknown domains)
 * S5: SKILL.md content review (prompt injection, credential access)
 */

/** A file to be scanned. */
export interface ScanFile {
  path: string;
  content: string;
  size: number;
}

export type RiskLevel = 'green' | 'yellow' | 'red';

export interface ScanResult {
  riskLevel: RiskLevel;
  stages: {
    s1: { findings: string[] };
    s2: { findings: string[]; skillName: string | null };
    s3: { findings: string[] };
    s4: { findings: string[] };
    s5: { findings: string[] };
  };
  totalIssues: number;
}

// Binary file extensions to flag
const BINARY_EXTENSIONS = ['.exe', '.dll', '.so', '.dylib', '.bin', '.obj', '.o', '.a', '.lib', '.pyd', '.pyc'];

// Dangerous API patterns for S3
const DANGEROUS_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /child_process|require\s*\(\s*['"]child_process['"]\s*\)/, label: 'child_process' },
  { pattern: /\bexec\s*\(|\.exec\s*\(/, label: 'exec' },
  { pattern: /\bspawn\s*\(|\.spawn\s*\(/, label: 'spawn' },
  { pattern: /\beval\s*\(/, label: 'eval' },
  { pattern: /new\s+Function\s*\(/, label: 'new Function' },
  { pattern: /\bfetch\s*\(/, label: 'fetch' },
  { pattern: /XMLHttpRequest/, label: 'XMLHttpRequest' },
  { pattern: /\baxios\b/, label: 'axios' },
  { pattern: /\brequests\.(get|post|put|delete|patch)\s*\(/, label: 'requests' },
  { pattern: /\burllib\b/, label: 'urllib' },
  { pattern: /fs\.(writeFile|writeFileSync|unlink|unlinkSync|rmdir|rmdirSync)\s*\(/, label: 'fs write/delete' },
  { pattern: /\bos\.remove\b|\bshutil\.rmtree\b/, label: 'os.remove/shutil.rmtree' },
  { pattern: /\bprocess\.env\b/, label: 'process.env' },
  { pattern: /\bos\.environ\b/, label: 'os.environ' },
  { pattern: /vm\.runInNewContext/, label: 'vm.runInNewContext' },
];

// Known-safe domains for S4
const SAFE_DOMAINS = new Set([
  'github.com',
  'raw.githubusercontent.com',
  'api.github.com',
  'openai.com',
  'bigmodel.cn',
  'npmjs.com',
  'pypi.org',
  'objects.githubusercontent.com',
]);

// Prompt injection patterns for S5
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(previous|prior|all|above)\s+instructions/i,
  /you\s+are\s+now\s+/i,
  /act\s+as\s+/i,
  /disregard\s+(all|previous|prior)\s+/i,
  /forget\s+(everything|all|previous)\s+/i,
];

// Credential access patterns for S5
const CREDENTIAL_PATTERNS: RegExp[] = [
  /\bAPI\s*KEY\b/i,
  /\bSECRET\b/i,
  /\bpassword\b/i,
  /\bcredential\b/i,
  /\btoken\b/i,
  /process\.env\.\w*(KEY|SECRET|TOKEN|PASSWORD)\w*/i,
];

// File types to scan in S3 (executable/code files)
const SCANNABLE_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx', '.py', '.sh', '.mjs', '.cjs'];

function hasScannableExt(path: string): boolean {
  return SCANNABLE_EXTENSIONS.some(ext => path.endsWith(ext));
}

function hasBinaryExt(path: string): boolean {
  return BINARY_EXTENSIONS.some(ext => path.toLowerCase().endsWith(ext));
}

/** Extract URLs from text content. */
function extractUrls(text: string): string[] {
  const urls: string[] = [];
  const urlRegex = /https?:\/\/[^\s'"`<>)]+/g;
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    urls.push(match[0]);
  }
  return urls;
}

/** Run the 5-stage safety scan on a set of files. */
export function runSafetyScan(files: ScanFile[]): ScanResult {
  const s1: string[] = [];
  const s2: string[] = [];
  const s3: string[] = [];
  const s4: string[] = [];
  const s5: string[] = [];
  let skillName: string | null = null;

  // --- S1: File Inventory Audit ---
  let totalSize = 0;
  for (const file of files) {
    totalSize += file.size;

    if (hasBinaryExt(file.path)) {
    s1.push(`binary file detected: ${file.path}`);
    }
  }

  const SIZE_LIMIT = 5 * 1024 * 1024; // 5MB
  if (totalSize > SIZE_LIMIT) {
    s1.push(`Total size ${(totalSize / 1024 / 1024).toFixed(1)}MB exceeds 5MB limit`);
  }

  // --- S2: Metadata Validation ---
  const skillMd = files.find(f => f.path === 'SKILL.md' || f.path.endsWith('/SKILL.md'));
  if (skillMd) {
    const fmMatch = skillMd.content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const fm = fmMatch[1];
      const nameMatch = fm.match(/^name:\s*(.+)$/m);
      const descMatch = fm.match(/^description:\s*(.+)$/m);

      if (!nameMatch) {
        s2.push('SKILL.md frontmatter missing required "name" field');
      } else {
        skillName = nameMatch[1].trim();
      }

      if (!descMatch) {
        s2.push('SKILL.md frontmatter missing required "description" field');
      }
    } else {
      s2.push('SKILL.md has no YAML frontmatter');
    }
  }

  // --- S3: Static Pattern Scan (only executable files) ---
  for (const file of files) {
    if (!hasScannableExt(file.path)) continue;

    for (const { pattern, label } of DANGEROUS_PATTERNS) {
      if (pattern.test(file.content)) {
        s3.push(`${label} in ${file.path}`);
      }
    }
  }

  // --- S4: Domain Reference Check ---
  for (const file of files) {
    const urls = extractUrls(file.content);
    for (const url of urls) {
      if (url.startsWith('http://')) {
        s4.push(`Non-HTTPS URL in ${file.path}: ${url.substring(0, 60)}`);
      } else if (url.startsWith('https://')) {
        try {
          const hostname = new URL(url).hostname;
          const isSafe = SAFE_DOMAINS.has(hostname) ||
            [...SAFE_DOMAINS].some(d => hostname.endsWith('.' + d));
          if (!isSafe) {
            s4.push(`Unknown domain in ${file.path}: ${hostname}`);
          }
        } catch {
          // Skip malformed URLs
        }
      }
    }
  }

  // --- S5: SKILL.md Content Review ---
  if (skillMd) {
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(skillMd.content)) {
        s5.push(`Prompt injection pattern detected in SKILL.md`);
        break;
      }
    }

    for (const pattern of CREDENTIAL_PATTERNS) {
      if (pattern.test(skillMd.content)) {
       s5.push(`credential/key reference detected in SKILL.md`);
        break;
      }
    }
  }

  // --- Risk Aggregation ---
  const s3Count = s3.length;
  const hasInjection = s5.some(f => f.includes('injection'));
  const totalIssues = s1.length + s2.length + s3Count + s4.length + s5.length;

  let riskLevel: RiskLevel;
  if (s3Count > 3 || hasInjection) {
    riskLevel = 'red';
  } else if (s3Count >= 1 || s1.length > 0 || s2.length > 0 || s5.length > 0) {
    riskLevel = 'yellow';
  } else {
    riskLevel = 'green';
  }

  return {
    riskLevel,
    stages: {
      s1: { findings: s1 },
      s2: { findings: s2, skillName },
      s3: { findings: s3 },
      s4: { findings: s4 },
      s5: { findings: s5 },
    },
    totalIssues,
  };
}
