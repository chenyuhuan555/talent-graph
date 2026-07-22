import fs from 'node:fs';
import path from 'node:path';

const FORBIDDEN_FILENAMES = new Set([
  'persons.json',
  'details.json',
  'dashboard.json',
  'sync.json',
  'talent_graph.db',
  'talent-graph.db',
]);

const FORBIDDEN_CONTENT = [
  /SQLite format 3\x00/i,
  /postgres(?:ql)?:\/\//i,
  /\bsb_secret_[A-Za-z0-9_-]{20,}\b/i,
  /(?:^|[\\/])talent[_-]graph\.db/i,
];

function filesUnder(directory: string): string[] {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(fullPath) : [fullPath];
  });
}

export function assertSafeBuildArtifact(artifactDirectory: string): void {
  const loginPage = path.join(artifactDirectory, 'login', 'index.html');
  const notFoundPage = path.join(artifactDirectory, '404.html');
  if (!fs.existsSync(loginPage) || !fs.existsSync(notFoundPage)) {
    throw new Error('不安全的构建产物：缺少登录页或 404 页面');
  }

  const findings: string[] = [];
  for (const file of filesUnder(artifactDirectory)) {
    const basename = path.basename(file).toLowerCase();
    if (FORBIDDEN_FILENAMES.has(basename)) {
      findings.push(path.relative(artifactDirectory, file));
      continue;
    }
    const content = fs.readFileSync(file).toString('utf8');
    if (FORBIDDEN_CONTENT.some((pattern) => pattern.test(content))) {
      findings.push(path.relative(artifactDirectory, file));
    }
  }
  if (findings.length > 0) {
    throw new Error(`不安全的构建产物：${findings.join(', ')}`);
  }
}
