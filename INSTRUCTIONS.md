# IAMCCS Annotate — User Guide

Version: 2.0.0

A fast, reliable annotation layer for ComfyUI. Draw, erase, organize in layers, and save notes inside your workflow.

## What’s included

- Zero-offset drawing/erasing that sticks to the graph while you pan/zoom
- Floating button with context menu and a draggable dock panel when sidebar is missing
- Layers with visibility/lock/rename/delete
- Per-mode brush sizes (draw vs eraser), opacity, dashed lines, constant width
 - HiDPI ×2 toggle for higher-quality rendering
- Select / Transform / Rotate tools (drag-to-select, then act on corners)
- Screenshot Post-its (drag to capture, then move from edges; can be moved even when Annotate is OFF)
- Pin/unpin mode for Post-its (lock a screenshot so it can't be moved/resized/rotated)
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
- Alt+1 — Tool: Draw
- Alt+2 — Tool: Select
- Alt+3 — Tool: Transform
- Alt+4 — Tool: Rotate
- Alt+5 — Tool: Screenshot
- Alt+P — Toggle Pin/unpin mode (click a post-it to pin/unpin)
- Ctrl+I — Import workflow + notes (JSON)
- Ctrl+C — Copy selection (Select tool)
- Ctrl+X — Cut selection (Select tool)
- Ctrl+V — Paste selection (Select tool)
- Delete / Backspace — Delete current selection (any tool)
- Esc — Cancel current stroke / clear current selection

Notes:
- Tool shortcuts (Alt+1..5) and Alt+P are active when Annotate is ON.

Note: On macOS, Alt refers to Option.

## Drawing options

- Color: color picker
- Brush size: 1–48 px
- Opacity: 10–100%
- Dashed: enable dashed strokes
- Constant width: keeps the stroke width consistent on-screen regardless of zoom
 - HiDPI ×2: supersamples annotation rendering for crisper lines (uses more memory)
- Draw above nodes: when enabled, notes appear in the foreground; disable to push them behind nodes

## Tools

### Select
- Drag to create a selection (rectangle or lasso)
- The big selection frame is shown only while dragging; after release, selected items are highlighted
- Drag inside a selected group to move it

### Transform
- Drag a corner handle to scale the selected items
- Corners have a larger hit-area and visible handles for easier grabbing

### Rotate
- Drag a corner handle to rotate the selected items

### Screenshot (Post-it)
- Drag a rectangle to capture a screenshot of the visible canvas
- Move a post-it by dragging any edge
- Move still works even when Annotate is OFF

### Text (+Text)
- Click **+ Text** (next to **+ Layer**) to enter Text mode
- Drag a rectangle on the workflow to set the text box size, then start typing
- A font dropdown + size input appear next to **+ Text** in the menu
- Double-click a text box to edit it later
- Text boxes behave like a single object for Select / Transform / Rotate

### Pin/unpin (Post-it lock)
- Enable Pin/unpin mode (Alt+P or the checkbox)
- Click a post-it to toggle a red pin icon
- Pinned post-its cannot be moved/resized/rotated (even if selected)

## Layers

- + Layer: adds a new layer and selects it
- Click name: selects the layer
- Double-click name: rename; Enter to save, Esc to cancel
- Eye icon: toggle visibility
- Lock icon: prevent edits on the layer
- X: delete layer (at least one layer is always kept)

### Layer color preview

- Each layer stores its own drawing color. When you select a layer, the color picker preview updates immediately to that layer’s saved color.

## Saving and persistence

- Local autosave keeps deletes/edits immediately (survives refresh).
- If **Save into WF** is enabled, annotations are also embedded into `workflow.extra.iamccs_annotations` (so they travel with the workflow JSON).
- Automatically saves when you:
  - complete a stroke
  - paste
  - clear
  - import
  - change key settings
- When you load a workflow, embedded annotations load automatically
- Each workflow/subgraph keeps its own annotations

## Export / Import

- Export (menu): use **Export Workflow+Notes** to download a JSON of the full workflow with annotations embedded in `extra.iamccs_annotations`
- Import (Ctrl+I): loads the full workflow if present; otherwise imports annotations only
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
