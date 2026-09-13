import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// Relative assets allow this build to live at /WavID/ or inside another site.
export default defineConfig({
  base: './',
  plugins: [{
    name: 'retain-distribution-notices',
    generateBundle() {
      for (const [source, fileName] of [
        ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
        ['src/renderer/REMOTION-LICENSE.md', 'src/renderer/REMOTION-LICENSE.md'],
        ['src/renderer/RANDOM-SOURCES.md', 'src/renderer/RANDOM-SOURCES.md'],
      ]) this.emitFile({ type: 'asset', fileName, source: readFileSync(new URL(source, import.meta.url), 'utf8') });
    },
  }],
  server: { port: 18990, strictPort: true },
  preview: { port: 18990, strictPort: true },
});
