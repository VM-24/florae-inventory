/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'full' shows the complete inventory UI; anything else (default) shows the simple one. */
  readonly VITE_INVENTORY_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
