# EpiRootkit — Documentation Blog

Documentation blog for the [EpiRootkit](https://gitlab.com/epita) project — a Linux kernel rootkit (LKM) + Flask C2 server built at EPITA.

Built with [Astro v6](https://astro.build) using the blog template, dark-themed with neon green accents.

## Prerequisites

- **Node.js** ≥ 18 — [nodejs.org](https://nodejs.org)
- **npm** ≥ 9 (bundled with Node)

Check your versions:
```sh
node -v
npm -v
```

## Setup

```sh
# 1. Clone the repo
git clone https://github.com/ariianel/project-blog-doc.git
cd project-blog-doc

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev
# → http://localhost:4321
```

## Commands

All commands are run from the project root:

| Command           | Action                                      |
| :---------------- | :------------------------------------------ |
| `npm install`     | Install dependencies                        |
| `npm run dev`     | Start dev server at `localhost:4321`        |
| `npm run build`   | Build production site to `./dist/`          |
| `npm run preview` | Preview the production build locally        |

## Project Structure

```text
src/
├── assets/           # fonts, images (pixel art rootkit image, etc.)
├── components/       # Header, Footer, HeaderLink
├── layouts/
│   ├── BlogPost.astro       # blog post layout
│   ├── FeaturePage.astro    # shared layout for all feature pages
│   └── Layout.astro         # base HTML layout
├── pages/
│   ├── index.astro          # home page
│   ├── rootkit.astro        # rootkit overview + SVG feature tree
│   ├── architecture.astro   # system architecture
│   ├── setup.astro          # VM setup guide
│   ├── features/
│   │   ├── c2-server.astro
│   │   ├── connection.astro
│   │   ├── exec.astro
│   │   ├── upload-download.astro
│   │   ├── reverse-shell.astro
│   │   ├── hide-module.astro
│   │   ├── hide-files.astro
│   │   └── hide-lines.astro
│   └── blog/                # markdown/MDX blog posts
├── content/
│   └── blog/                # .md / .mdx post files
public/                      # static assets (favicon, etc.)
astro.config.mjs
package.json
tsconfig.json
```

## Deploy to Vercel

The easiest way to host this blog:

1. Push the repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import this repo
3. Vercel auto-detects Astro — no config needed
4. Every `git push` to `main` triggers a redeploy automatically

## Deploy to GitHub Pages

Update `astro.config.mjs`:
```js
export default defineConfig({
  site: 'https://ariianel.github.io',
  base: '/project-blog-doc',
  // ...
});
```

Then enable **GitHub Pages** in the repo settings (Settings → Pages → Source: GitHub Actions) and add the [official Astro GitHub Actions workflow](https://docs.astro.build/en/guides/deploy/github/).
