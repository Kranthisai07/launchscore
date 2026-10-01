// SHA-256 of the favicon each framework's starter template ships with. A site whose icon matches one of
// these never replaced the template's icon.
//
// Every hash was computed on 2026-10-01 from the file as served by raw.githubusercontent.com, straight
// from the template repository named in `source`. Nothing here is guessed. Templates change over time, so
// a project made from an older or newer template may carry a version that is not listed: that is a miss,
// never a false alarm.
//
// Not included, because the template file could not be located and verified: SvelteKit, Lovable, Bolt,
// v0, Remix, Replit.

export interface DefaultFavicon {
  framework: string;
  sha256: string;
  source: string;
}

export const DEFAULT_FAVICONS: DefaultFavicon[] = [
  {
    framework: "Vite",
    // vitejs/vite, packages/create-vite/template-react and template-vanilla, public/vite.svg (1497 bytes).
    // Identical at tags v4.0.0, v5.0.0, v6.0.0 and v7.0.0.
    sha256: "4a748afd443918bb16591c834c401dae33e87861ab5dbad0811c3a3b4a9214fb",
    source: "vitejs/vite packages/create-vite/template-react/public/vite.svg (v4.0.0 to v7.0.0)",
  },
  {
    framework: "Vite",
    // vitejs/vite main, packages/create-vite/template-{react,react-ts,vue,svelte,preact,solid}/public/favicon.svg (9522 bytes)
    sha256: "61bc9a161de58248288e6905425d7180f0624c2865007b97d763fdac12043a66",
    source: "vitejs/vite main packages/create-vite/template-react/public/favicon.svg",
  },
  {
    framework: "Vite",
    // vitejs/vite main, packages/create-vite/template-vanilla/public/favicon.svg (9523 bytes)
    sha256: "ceeac38434be7a3b4d0f68b8cd8aa2b9ae78c260d6343087c6e095f8031ce4ff",
    source: "vitejs/vite main packages/create-vite/template-vanilla/public/favicon.svg",
  },
  {
    framework: "Next.js",
    // vercel/next.js canary, packages/create-next-app/templates/app/{js,ts}/app/favicon.ico (15086 bytes)
    sha256: "c28fdd2a4f31e2dc64f653962286da5c82a4cdfc518b242d32812c624e9a19a4",
    source: "vercel/next.js canary packages/create-next-app/templates/app/js/app/favicon.ico",
  },
  {
    framework: "Next.js",
    // vercel/next.js v12.0.0 templates/default/public/favicon.ico and v13.4.0 templates/app/js/app/favicon.ico,
    // identical (25931 bytes)
    sha256: "2b8ad2d33455a8f736fc3a8ebf8f0bdea8848ad4c0db48a2833bd0f9cd775932",
    source: "vercel/next.js v12.0.0 and v13.4.0 create-next-app templates favicon.ico",
  },
  {
    framework: "Create React App",
    // facebook/create-react-app main, packages/cra-template/template/public/favicon.ico (3870 bytes)
    sha256: "3d10f7da6c603178340081668c4ac5b3ae9743ca9a262ab0fcd312fbb9f48bdd",
    source: "facebook/create-react-app main packages/cra-template/template/public/favicon.ico",
  },
  {
    framework: "Astro",
    // withastro/astro main, examples/basics/public/favicon.svg (749 bytes)
    sha256: "2d7a310283d6f9cc753210d83224cd6db6348cb82a5536348884e5831d46203f",
    source: "withastro/astro main examples/basics/public/favicon.svg",
  },
  {
    framework: "Nuxt",
    // nuxt/starter branch v3, public/favicon.ico (4286 bytes)
    sha256: "1057b17aec08a7191d134000203947f195a8aa7c84c39f1164cee8d01279762a",
    source: "nuxt/starter v3 public/favicon.ico",
  },
  {
    framework: "Angular",
    // angular/angular-cli main, packages/schematics/angular/application/files/common-files/public/favicon.ico.template
    // (an .ico file that the schematic copies as favicon.ico; 15086 bytes)
    sha256: "f9102be80297c0529207607be5277b4f90bca89d65988fa1771b91c7894e815f",
    source: "angular/angular-cli main packages/schematics/angular/application/files/common-files/public/favicon.ico.template",
  },
];
