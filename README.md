# kmann.dev

Games, simulations and other small programs, all reachable from one domain.
The site itself is static files with no build step and no dependencies.

## Layout

```
index.html                 project index
about.html                 about page
vercel.json                trailing slashes, and the proxy for apps hosted elsewhere
assets/css/site.css        shared shell (colour tokens, header, footer)
assets/css/home.css        project card grid
assets/css/app.css         app page chrome
assets/css/studio.css      full-screen canvas with an overlay settings panel
assets/js/studio.js        collapsible side panel on desktop, draggable bottom sheet on phones
assets/js/offline.js       the per-app "Save offline" / "Install app" button
sw.js                      serves a saved app from cache when the network is gone
tools/offline-files.mjs    writes each app's manifest.webmanifest and offline-files.json
assets/js/projects.js      the project list
assets/js/render-projects.js
apps/<slug>/               one folder per app that lives in this repo
apps/template/             starting point to copy for a new app
```

Each app owns its folder and imports nothing from its siblings, so any one of them
can be lifted out later without untangling the rest.

## Adding an app that lives here

1. `cp -r apps/template apps/<slug>` and edit `apps/<slug>/index.html` and `app.js`.
2. Drop a 4:3 screenshot at `assets/img/posters/<slug>.webp`.
3. Add an entry to `PROJECTS` in `assets/js/projects.js`:

   ```js
   {
     title: 'Wave Tank',
     href: 'apps/wave-tank/',
     poster: 'assets/img/posters/wave-tank.webp',
     blurb: 'One line, shown on hover.',
     status: 'live',
   }
   ```

`status: 'planned'` renders a dashed placeholder card and ignores `href`.

Apps built around a canvas and a settings panel use the studio layout instead of
`app.css`: link `studio.css`, give `<body>` the `studio` class, put the canvas in
`<main class="studio-stage">` and the controls in an `<aside class="studio-panel"
data-studio-panel>` holding a `data-studio-handle` button and a `.studio-panel-body`,
then load `studio.js` as a module. The Galaxy Photo Generator is the reference.

## Offline copies

Every app has a "Save offline" button. It downloads the files listed in the app's
`offline-files.json` into the browser's cache and registers `sw.js` for that app's
folder. From then on the app loads from the network when it can and from the saved
copy when it can't, and each online visit refreshes the copy. Browsers that support it
then offer "Install app", which opens the app in its own window.

The list is generated from `git ls-files`, so after adding, renaming or deleting files
in an app, commit them and run:

```
node tools/offline-files.mjs
```

A stale list only matters for files a visitor never loaded while online.

## Adding an app that lives in another repo

An app with its own repo and its own deploy stays there and gets proxied, so
kmann.dev never holds a copy and never falls behind. FractalExplorer works this
way: it is developed in [notFrost/fractal-explorer](https://github.com/notFrost/fractal-explorer)
and deployed on its own Vercel project, and `vercel.json` here rewrites
`/apps/fractal-explorer/*` onto that deployment. Merging there is live here.

To add another, copy both blocks in `vercel.json`:

- a **rewrite** pair forwarding `/apps/<slug>/*` to the upstream deployment, one
  entry preserving a trailing slash for directories and one without it for files
- a **redirect** sending bare `/apps/<slug>` to whatever the upstream serves as its
  entry point, so the upstream's own root redirect never fires

That redirect matters. Upstream answers `/` with a 307 to an absolute URL on its
own domain, which would bounce visitors off kmann.dev. Sending them straight to
the real entry point avoids it.

The upstream must use relative paths throughout, or it will break under a subpath.

## Local preview

```bash
python -m http.server 8000
```

Proxied apps 404 locally, because the rewrites only exist on Vercel. Use a Vercel
preview deployment to check those.
