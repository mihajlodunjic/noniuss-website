/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_CONTACT_FORM_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
