# Portfolio

Personal portfolio of Satyajit (Chris) Gade: astrophysics research and data science, built around a live gravitational-lensing background.

## Files
- `index.html`: all pages (Home, About, Research, Projects, Contact) as sections, shown one at a time through hash routing (`#about`, `#research`, ...)
- `style.css`: styles
- `script.js`: the lens engine (WebGL, with a Canvas 2D fallback), gravitational-wave ripples, lensed portrait, page transitions, and the lens-model demo
- `edited-photo.png`, `drBubbles.jpg`: images

## Run locally
Use a local server rather than opening the file directly, because the portrait lens reads the photo's pixels:

    python3 -m http.server 8000

Then open http://localhost:8000

## Deploy
Push to GitHub and enable Pages for the repository root.
