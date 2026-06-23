# WLKOM — Documentation Blog

Documentation site for the **WLKOM** project — a Linux kernel rootkit (LKM) + Flask C2 server built at EPITA for SYS2 2026.

Built with [Astro v6](https://astro.build) + [Starlight 0.40](https://starlight.astro.build) — sidebar navigation, dark/light theme, full-text search, and FR/EN language toggle included out of the box.

## Prerequisites

- **Node.js** ≥ 18 — [nodejs.org](https://nodejs.org)
- **npm** ≥ 9 (bundled with Node)

```sh
node -v   # must be ≥ 18
npm -v    # must be ≥ 9
```

## Quick start

```sh
# 1. Clone the repo
git clone https://github.com/ariianel/project-blog-doc.git
cd project-blog-doc

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev
# → open http://localhost:4321
```

## Commands

| Command           | Action                                           |
| :---------------- | :----------------------------------------------- |
| `npm install`     | Install dependencies                             |
| `npm run dev`     | Start dev server at `localhost:4321`             |
| `npm run build`   | Build production site to `./dist/`               |
| `npm run preview` | Preview the production build locally             |

## Project structure

```
project-blog-doc/
├── astro.config.mjs          # Starlight config: sidebar, i18n, social links
├── src/
│   ├── content.config.ts     # Content collection schema (Starlight)
│   ├── content/
│   │   ├── docs/             # English pages (default locale)
│   │   │   ├── index.mdx     # Home page
│   │   │   ├── architecture.md
│   │   │   ├── setup.md
│   │   │   ├── c2-server.md
│   │   │   ├── choices.md
│   │   │   └── rootkit/
│   │   │       ├── index.md
│   │   │       ├── connection.md
│   │   │       ├── exec.md
│   │   │       ├── upload-download.md
│   │   │       ├── reverse-shell.md
│   │   │       ├── hide-module.md
│   │   │       ├── hide-files.md
│   │   │       └── hide-lines.md
│   │   ├── docs/fr/          # French translations (same structure)
│   │   └── i18n/
│   │       └── fr.json       # French UI strings (search, nav labels…)
└── public/                   # Static images referenced in docs
```

## Editing content

All pages are plain Markdown (`.md`) or MDX (`.mdx`) files under `src/content/docs/`.

**Add a new English page:**
1. Create `src/content/docs/my-page.md` with a frontmatter title:
   ```md
   ---
   title: My Page
   description: One-line description for SEO.
   ---
   ```
2. Add it to the `sidebar` array in `astro.config.mjs`.

**Add a French translation:**
- Mirror the file at `src/content/docs/fr/my-page.md`.
- Sidebar labels for FR are set via the `translations: { fr: '...' }` key in `astro.config.mjs`.

**Add images:**
- Put images in `public/` (e.g. `public/screenshot.png`).
- Reference them in Markdown with an absolute path: `![alt](/screenshot.png)`.

## Internationalization (FR/EN)

The language toggle is built into the Starlight header — no extra setup needed. English is the default locale (pages live at `/`), French at `/fr/`. Starlight handles routing automatically.

## Deploy to Vercel

1. Push the repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import this repo
3. Vercel auto-detects Astro — no config needed
4. Every `git push` to `main` triggers a redeploy automatically

## Deploy to GitHub Pages

Update `site` in `astro.config.mjs`:
```js
export default defineConfig({
  site: 'https://ariianel.github.io',
  base: '/project-blog-doc',
  // ...
});
```

Then enable **GitHub Pages** in the repo settings (Settings → Pages → Source: GitHub Actions) and add the [official Astro GitHub Actions workflow](https://docs.astro.build/en/guides/deploy/github/).
