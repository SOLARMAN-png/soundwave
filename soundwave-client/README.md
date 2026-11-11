# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses Oxc
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite/tree/main/packages/plugin-react-swc) uses SWC

## Routing

The app uses React Router with browser-history URLs. The page routes are:

| Page | Path |
| --- | --- |
| Welcome | `/welcome` |
| Home | `/home` |
| Search | `/search` |
| Playlist | `/playlist` |
| Artist | `/artist` |
| Player | `/player` |
| Library | `/library` |
| Create Playlist | `/create-playlist` |
| AI Playlist Generator | `/ai-playlist-generator` |

The root path redirects to `/home`. The shared app layout wraps the main routes, while Welcome is displayed without that layout. Playlist and artist selections are carried in navigation state, so their selected item is preserved when navigating within the app and using browser history; directly opening or refreshing those static paths displays the page's default item.

Vite's development and preview servers serve the app entry point for these paths. When deploying to another static host, configure a fallback/rewrite to `index.html` so direct visits and refreshes on app routes work.

## React Compiler

The React Compiler is not enabled on this template because of its impact on build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. See the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript with Vite.
