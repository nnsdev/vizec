// Allow wildcard imports for esbuild-plugin-import-glob
declare module "*.ts" {
  const modules: any[];
  export default modules;
}

interface Window {
  vizecAPI: any;
}
