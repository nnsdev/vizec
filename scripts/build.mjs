import esbuild from "esbuild";
import importGlobPlugin from "esbuild-plugin-import-glob";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

async function build() {
  console.log("Building Main process...");
  execSync("tsc --project tsconfig.main.json", { stdio: "inherit" });

  console.log("Building Preload script...");
  execSync("tsc --project tsconfig.preload.json", { stdio: "inherit" });

  console.log("Building Renderer process...");
  await esbuild.build({
    entryPoints: ["src/renderer/control/index.ts", "src/renderer/visualizer/index.ts"],
    bundle: true,
    outdir: "dist/renderer",
    splitting: true,
    format: "esm",
    platform: "browser",
    external: ["electron"],
    loader: { ".ts": "ts" },
    plugins: [importGlobPlugin.default()],
    logLevel: "info",
  });

  console.log("Copying assets...");
  const copyDir = (src, dest) => {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const files = fs.readdirSync(src);
    for (const file of files) {
      const srcFile = path.join(src, file);
      const destFile = path.join(dest, file);
      if (srcFile.endsWith(".html") || srcFile.endsWith(".css") || srcFile.endsWith(".js")) {
        fs.copyFileSync(srcFile, destFile);
      }
    }
  };

  copyDir("src/renderer/visualizer", "dist/renderer/visualizer");
  copyDir("src/renderer/control", "dist/renderer/control");
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
