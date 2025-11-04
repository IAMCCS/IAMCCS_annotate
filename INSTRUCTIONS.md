# IAMCCS Annotate — User Guide

Version: 1.0.0

Coming soon: 2.0.0

A fast, reliable annotation layer for ComfyUI. Draw, erase, organize in layers, and save notes inside your workflow.

## What’s included

- Zero-offset drawing/erasing that sticks to the graph while you pan/zoom
- Floating button with context menu and a draggable dock panel when sidebar is missing
- Layers with visibility/lock/rename/delete
- Per-mode brush sizes (draw vs eraser), opacity, dashed lines, constant width
 - HiDPI ×2 toggle for higher-quality rendering
- Hide/show all annotations quickly
- Export/import your entire workflow + annotations
- Undo/redo and copy/paste for layers
- Draw above or below nodes (foreground/background)
- Automatic save to workflow.extra

## Quick start

1. Launch ComfyUI and load/open a workflow.
2. Click the floating button “Annotate: OFF” to turn ON (turns green).
3. Draw with left mouse. Middle button still pans the canvas.
4. Right-click the floating button to open the context menu.

## Shortcuts

- Alt+A — Toggle annotation mode
- Alt+D — Toggle eraser/draw
- Alt+S — Hide/show all annotations
- Alt+F — Export workflow + notes (JSON)
- Ctrl+I — Import workflow + notes (JSON)

Note: On macOS, Alt refers to Option.

## Drawing options

- Color: color picker
- Brush size: 1–48 px
- Opacity: 10–100%
- Dashed: enable dashed strokes
- Constant width: keeps the stroke width consistent on-screen regardless of zoom
 - HiDPI ×2: supersamples annotation rendering for crisper lines (uses more memory)
- Draw above nodes: when enabled, notes appear in the foreground; disable to push them behind nodes

## Layers

- + Layer: adds a new layer and selects it
- Click name: selects the layer
- Double-click name: rename; Enter to save, Esc to cancel
- Eye icon: toggle visibility
- Lock icon: prevent edits on the layer
- X: delete layer (at least one layer is always kept)

## Saving and persistence

- Saves to workflow.extra.iamccs_annotations
- Automatically saves when you:
  - complete a stroke
  - paste
  - clear
  - import
  - change key settings
- When you load a workflow, its annotations load automatically
- Each workflow keeps its own annotations

## Export / Import

- Export (Alt+F): downloads a JSON of the full workflow with annotations embedded in `extra.iamccs_annotations`
- Import (ctrl+I): loads the full workflow if present; otherwise imports annotations only
- Import JSON (menu): imports annotations into the current layer

## Troubleshooting

- Floating button doesn’t show
  - Wait a moment; it appears on first canvas draw
  - Restart ComfyUI if needed
- Eraser draws black instead of erasing
  - Make sure you’re using the included extension version; erasing works against an off-screen layer
- Notes shift when zooming/panning
  - Fixed: the plugin draws in graph-space and composes in screen-space with devicePixelRatio awareness
- Notes don’t load
  - Verify the workflow JSON has `extra.iamccs_annotations`
  - Ensure the menu toggle “Save into WF” is enabled if you want automatic saving

## Author and License

- Author: Carmine Cristallo Scalzi (IAMCCS)
- License: Creative Commons Attribution-NoDerivatives 4.0 International (CC BY-ND 4.0)
- License URL: https://creativecommons.org/licenses/by-nd/4.0/
