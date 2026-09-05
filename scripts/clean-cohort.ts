import fs from 'node:fs';
import path from 'node:path';

function findLatestMetaReport(tracesDir: string): string | null {
  if (!fs.existsSync(tracesDir)) return null;
  const files = fs.readdirSync(tracesDir)
    .filter((f) => f.startsWith('meta_report_') && f.endsWith('.md'))
    .map((f) => ({
      name: f,
      fullPath: path.join(tracesDir, f),
      mtime: fs.statSync(path.join(tracesDir, f)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime);

  return files.length > 0 ? files[0].fullPath : null;
}

export function parseCohortSessionIds(metaReportContent: string): string[] {
  const sessionIds: string[] = [];
  const lines = metaReportContent.split('\n');
  let inCohortSection = false;

  for (const line of lines) {
    if (line.includes('## 📋 Sessions Included in This Cohort')) {
      inCohortSection = true;
      continue;
    }
    if (inCohortSection && line.startsWith('## ')) {
      // End of section
      break;
    }
    if (inCohortSection) {
      const match = line.match(/-\s+`([a-f0-9-]{36})`/i) || line.match(/`([a-f0-9-]{36})`/i);
      if (match) {
        sessionIds.push(match[1]);
      }
    }
  }

  // Fallback: search for any UUIDs formatted in code ticks if section header had different formatting
  if (sessionIds.length === 0) {
    const allMatches = metaReportContent.matchAll(/`([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})`/gi);
    for (const m of allMatches) {
      if (!sessionIds.includes(m[1])) {
        sessionIds.push(m[1]);
      }
    }
  }

  return sessionIds;
}

export function cleanCohort(options: {
  metaReportPath?: string;
  keepMeta?: boolean;
  dryRun?: boolean;
  tracesDir?: string;
}): { deletedFiles: string[]; missingFiles: string[]; sessionIds: string[] } {
  const tracesDir = options.tracesDir || path.resolve(process.cwd(), 'traces');
  let metaReportPath = options.metaReportPath;

  if (!metaReportPath) {
    const latest = findLatestMetaReport(tracesDir);
    if (!latest) {
      throw new Error(`No meta-report found in ${tracesDir}`);
    }
    metaReportPath = latest;
  } else if (!path.isAbsolute(metaReportPath)) {
    metaReportPath = path.resolve(process.cwd(), metaReportPath);
  }

  if (!fs.existsSync(metaReportPath)) {
    throw new Error(`Meta report file does not exist: ${metaReportPath}`);
  }

  const content = fs.readFileSync(metaReportPath, 'utf-8');
  const sessionIds = parseCohortSessionIds(content);

  if (sessionIds.length === 0) {
    console.warn(`⚠️ Warning: No session IDs extracted from ${path.basename(metaReportPath)}`);
  }

  const filesToDelete: string[] = [];
  const missingFiles: string[] = [];

  for (const id of sessionIds) {
    const jsonTrace = path.join(tracesDir, `${id}.json`);
    const mdReport = path.join(tracesDir, `report_${id}.md`);

    if (fs.existsSync(jsonTrace)) {
      filesToDelete.push(jsonTrace);
    } else {
      missingFiles.push(jsonTrace);
    }

    if (fs.existsSync(mdReport)) {
      filesToDelete.push(mdReport);
    } else {
      missingFiles.push(mdReport);
    }
  }

  if (!options.keepMeta) {
    filesToDelete.push(metaReportPath);
  }

  if (!options.dryRun) {
    for (const f of filesToDelete) {
      try {
        fs.unlinkSync(f);
      } catch (err) {
        console.error(`Failed to delete ${f}:`, err);
      }
    }
  }

  return { deletedFiles: filesToDelete, missingFiles, sessionIds };
}

// CLI entry point
if (process.argv[1] && (process.argv[1].endsWith('clean-cohort.ts') || process.argv[1].endsWith('clean-cohort.js'))) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const keepMeta = args.includes('--keep-meta');
  const pathArg = args.find((a) => !a.startsWith('--'));

  try {
    console.log(`\n🧹 Gabo Cohort Trace Cleanup`);
    console.log(`================================`);
    if (dryRun) console.log(`[DRY RUN MODE - no files will be deleted]`);

    const result = cleanCohort({
      metaReportPath: pathArg,
      keepMeta,
      dryRun
    });

    console.log(`Cohort Sessions Identified: ${result.sessionIds.length}`);
    for (const id of result.sessionIds) {
      console.log(`  - ${id}`);
    }

    console.log(`\n${dryRun ? 'Files to be deleted' : 'Successfully deleted'} (${result.deletedFiles.length}):`);
    for (const f of result.deletedFiles) {
      console.log(`  🗑️  ${path.basename(f)}`);
    }

    if (result.missingFiles.length > 0) {
      console.log(`\nFiles already absent (${result.missingFiles.length}):`);
      for (const f of result.missingFiles) {
        console.log(`  ⚪ ${path.basename(f)}`);
      }
    }

    console.log(`\n✅ Done. Cleaned cohort traces.\n`);
  } catch (error) {
    console.error(`\n❌ Error:`, error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
