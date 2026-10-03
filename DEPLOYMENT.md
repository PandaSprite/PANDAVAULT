# PandaVault Deployment

## Vercel

Upload the contents of this project to the root of your GitHub repository and import that repository into Vercel.

The project includes:

- `index.html` for the PandaVault app
- `mods.json` for published mod-card data
- `about.json` for published About content
- `api/creator/login.js` for Creator Terminal authentication
- `api/changelog.js` for persistent Articles
- `package.json` with the Vercel Blob dependency

## Creator Terminal

The creator code is hardcoded server-side in `api/creator/login.js` as `admin123`. It is not placed in `index.html`.

Change that value in the server file if you want a different creator code. Anyone with access to the private repository can see server source code, so repository privacy is still important.

## Articles

Articles are stored in a private Vercel Blob at `pandavault/changelog.json`.

Connect a Vercel Blob store to the project so Vercel provides the Blob read/write token. No creator-secret environment variable is required for Creator Terminal.

## Mods

Use the PandaVault **VERCEL MODS.JSON** panel to download the current mod data as `mods.json`. Place that generated file in the repository root and redeploy through Vercel.

## About

The About page loads the published `about.json` from the repository. The creator editor saves changes locally in the browser and provides an **about.json** download button. Replace the repository's `about.json` with the downloaded file when publishing changes.
