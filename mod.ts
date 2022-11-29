import {
  esbuild,
  fromFileUrl,
  ImportMap,
  resolveImportMap,
  resolveModuleSpecifier,
  toFileUrl,
} from "./deps.js";
import { load as nativeLoad } from "./src/native_loader.js";
import { load as portableLoad } from "./src/portable_loader.js";
import { ModuleEntry } from "./src/deno.js";
import { getNodeModulesPath } from './src/node.js';
import { existsSync } from 'fs';
import { transformExtern, DeepkitPluginOptions } from '@gjsify/esbuild-plugin-deepkit';

export interface DenoPluginOptions {
  /**
   * Specify the URL to an import map to use when resolving import specifiers.
   * The URL must be fetchable with `fetch`.
   */
  importMapURL?: URL;
  /**
   * Specify which loader to use. By default this will use the `native` loader,
   * unless the `--allow-run` permission has not been given.
   *
   * - `native`:     Shells out to the Deno execuatble under the hood to load
   *                 files. Requires --allow-read and --allow-run.
   * - `portable`:   Do module downloading and caching with only Web APIs.
   *                 Requires --allow-read and/or --allow-net.
   */
  loader?: "native" | "portable";
}

/** The default loader to use. */
export const DEFAULT_LOADER: "native" | "portable" = "portable";

export function denoPlugin(options: DenoPluginOptions & DeepkitPluginOptions = {}): esbuild.Plugin {
  const loader = options.loader ?? DEFAULT_LOADER;
  return {
    name: "deno",
    setup(build) {
      const infoCache = new Map<string, ModuleEntry>();
      let importMap: ImportMap | null = null;

      build.onStart(async function onStart() {
        if (options.importMapURL !== undefined) {
          const resp = await fetch(options.importMapURL.href);
          const txt = await resp.text();
          importMap = resolveImportMap(JSON.parse(txt), options.importMapURL);
        } else {
          importMap = null;
        }
      });

      build.onResolve({ filter: /.*/ }, async function onResolve(
        args: esbuild.OnResolveArgs,
      ): Promise<esbuild.OnResolveResult | null | undefined> {

        // If this is a node module
        // if(args.kind === 'import-statement') {
        //   const nodeModulePath = await getNodeModulesPath(args.path);
        //   if(nodeModulePath) {
        //     return null
        //   }
        // }
        
        const resolveDir = args.resolveDir
          ? `${toFileUrl(args.resolveDir).href}/`
          : "";
        const referrer = args.importer
          ? `${args.namespace}:${args.importer}`
          : resolveDir;
        let resolved: URL;
        if (importMap !== null) {
          const res = resolveModuleSpecifier(
            args.path,
            importMap,
            new URL(referrer) || undefined,
          );
          resolved = new URL(res);
        } else {
          resolved = new URL(args.path, referrer);
        }
        const protocol = resolved.protocol;
        if (protocol === "file:") {
          const path = fromFileUrl(resolved);
          if(existsSync(path)) {
            return { path, namespace: "file" };
          } else {
            return null;
          }
        }
        const path = resolved.href.slice(protocol.length);
        return { path, namespace: protocol.slice(0, -1) };

      });

      async function onLoad(
        args: esbuild.OnLoadArgs,
      ): Promise<esbuild.OnLoadResult | null> {
        let url;
        if (args.namespace === "file") {
          url = toFileUrl(args.path);
        } else {
          url = new URL(`${args.namespace}:${args.path}`);
        }

        let result: esbuild.OnLoadResult | null = null

        switch (loader) {
          case "native":
            result = await nativeLoad(infoCache, url, options);
          case "portable":
            result = await portableLoad(url, options);
        }

        if(result?.contents) {
          return transformExtern(options, args, result);
        }
      }
      build.onLoad({ filter: /.*\.json/, namespace: "file" }, onLoad);
      build.onLoad({ filter: /.*/, namespace: "http" }, onLoad);
      build.onLoad({ filter: /.*/, namespace: "https" }, onLoad);
      build.onLoad({ filter: /.*/, namespace: "data" }, onLoad);
    },
  };
}
