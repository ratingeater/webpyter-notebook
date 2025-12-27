/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COLLAB_WS_URL?: string;
  readonly VITE_COLLAB_TOKEN?: string;
  readonly VITE_COLLAB_CONNECT_TIMEOUT_MS?: string;
  readonly VITE_BACKEND_KERNEL_URL?: string;
  readonly VITE_DEFAULT_KERNEL_MODE?: "backend" | "pyodide";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
