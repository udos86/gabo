import { spawn } from 'node:child_process';
import path from 'node:path';

const personas = ['polite', 'friction', 'terse'];

async function runPersona(persona: string): Promise<void> {
  console.log(`\n============================================================`);
  console.log(`🚀 RUNNING HEADLESS TEST AGENT PERSONA: [${persona.toUpperCase()}]`);
  console.log(`============================================================\n`);

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--experimental-strip-types', path.resolve(process.cwd(), 'scripts/test-agent.ts'), `--persona=${persona}`],
      {
        stdio: 'inherit',
        env: { ...process.env }
      }
    );

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Persona run [${persona}] failed with exit code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

async function main() {
  console.log(`🎯 Starting Test Cohort: [${personas.join(', ')}]`);
  for (const persona of personas) {
    try {
      await runPersona(persona);
    } catch (err) {
      console.error(`❌ Error running persona ${persona}:`, err);
      process.exitCode = 1;
      return;
    }
  }
  console.log(`\n🎉 All cohort personas completed successfully!`);
}

void main();
