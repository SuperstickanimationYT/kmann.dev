# kmann.dev

Games, simulations and other small programs, all served from one domain as static
files. No build step, no dependencies: open `index.html` in a browser and it works.

## Layout

```
index.html                 project index
about.html                 about page
assets/css/site.css        shared shell (colour tokens, header, footer)
assets/css/home.css        project card grid
assets/css/app.css         app page chrome
assets/js/projects.js      the project list
assets/js/render-projects.js
apps/<slug>/               one folder per app, self-contained
```

Each app owns its folder and imports nothing from its siblings, so any one of them
can be lifted out later without untangling the rest.

## Adding an app

1. `cp -r apps/template apps/<slug>` and edit `apps/<slug>/index.html` and `app.js`.
2. Drop a 4:3 screenshot at `assets/img/posters/<slug>.png`.
3. Add an entry to `PROJECTS` in `assets/js/projects.js`:

   ```js
   {
     title: 'Fractal Explorer',
     href: 'apps/fractal-explorer/',
     poster: 'assets/img/posters/fractal-explorer.png',
     blurb: 'Pan and zoom the Mandelbrot set.',
     status: 'live',
   }
   ```

`status: 'planned'` renders a dashed placeholder card and ignores `href`.

## An app that needs a server

An app needing a server process or a toolchain this static site cannot build gets
its own subdomain and its own repo. Register it here with an absolute `href` so it
still appears in the index.

## Local preview

Double-clicking `index.html` works. For a closer match to production:

```bash
python -m http.server 8000
```

## Still to fill in

- The `Buy me a coffee` link in every footer points at `#`.
- `about.html` holds placeholder copy.
