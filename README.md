# Revideo Content Canvas Edit Modal

A standalone React editor based on the Content Canvas editing workflow, with a Revideo-powered animated preview.

## Run

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal. Use the editor to pick a template, change copy and colors, add draggable overlay badges or shapes, then save/reset the editor state.

## Revideo output

The Revideo composition is in `src/revideo/scenes/contentCanvas.tsx`. Open its studio with:

```bash
npm run studio
```

The browser editor passes template copy, colors, and animation settings to the Revideo player as project variables. Added freeform overlays currently live in the editor canvas; wiring their serialized array into the render scene is the remaining step for export parity.
