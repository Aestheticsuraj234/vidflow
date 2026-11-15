import {defineConfig} from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/setup.ts'],
  format: ['esm'],
  target: 'node22',
  clean: true,
  splitting: false,
  noExternal: [/^@vidflow\//],
  esbuildPlugins: [
    {
      // Workspace packages ship TypeScript source, so bundle them in. Every
      // other bare import stays external and loads from node_modules, so
      // CommonJS packages such as `pg` keep working.
      name: 'external-node-modules',
      setup(build) {
        build.onResolve({filter: /^[^./]/}, (args) =>
          args.path.startsWith('@vidflow/') ? undefined : {path: args.path, external: true},
        );
      },
    },
  ],
});
