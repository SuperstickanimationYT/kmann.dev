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

## Still to fill in

- The `Buy me a coffee` link in every footer points at `#`.
- `about.html` holds placeholder copy.
