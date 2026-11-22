/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  /** 'full' shows the complete inventory UI; anything else (default) shows the simple one. */
  readonly VITE_INVENTORY_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
