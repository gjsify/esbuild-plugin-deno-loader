import { globPlugin } from 'esbuild-plugin-glob';
import { build } from 'esbuild';
import { readFile } from 'fs/promises';
import { extname, dirname } from 'path';
import { EXTERNALS_NODE } from '@gjsify/resolve-npm';

const pkg = JSON.parse(
    await readFile(
      new URL('./package.json', import.meta.url), 'utf8'
    )
);

if (!pkg.main && !pkg.module) {
    throw new Error("package.json: The main or module property is required!");
}

const baseConfig = {
    entryPoints: ['mod.ts'],
    bundle: true,
    minify: false,
    external: [
        ...EXTERNALS_NODE,
        'typescript',
        '@deepkit/type-compiler',
        'esbuild',
        // '@gjsify/resolve-npm',
        '@gjsify/esbuild-plugin-gjsify',
        '@gjsify/esbuild-plugin-deepkit',
    ],
    plugins: [
        globPlugin(),
    ]
}

// CJS
if (pkg.main) {
    build({
        ...baseConfig,
        outdir: dirname(pkg.main),
        format: 'cjs',
        outExtension: {'.js': extname(pkg.main)},
        platform: "node",
    });    
}

// ESM
if (pkg.module) {
    build({
        ...baseConfig,
        outdir: dirname(pkg.module),
        format: 'esm',
        outExtension: {'.js': extname(pkg.module)},
    });
}

// Test
build({
    ...baseConfig,
    entryPoints: ['run-tests.ts', 'mod_test.ts'],
    outdir: '.',
    format: 'esm',
    outExtension: {'.js': '.mjs'},
});