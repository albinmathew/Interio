# Interio user guide

Interio turns a floor-plan PDF into a furnished 3D home you can walk through. A project moves through four steps: import the plan, check it in **Plan** mode, furnish it in **Design** mode, and look around in **Walk** mode. Everything is saved in your browser as you work.

The same guide is available inside the app: open a project and press the **Help** button in the header.

## Import a floor plan

Start from **Upload a floor plan** on the dashboard, or drop a PDF anywhere on the dashboard or the import page.

- **What works best.** A PDF exported from CAD by a builder or an architect. Its line work carries walls, doors and windows, and Interio reads them directly.
- **Scans and photos.** A PDF that is only a picture has no walls to read. Interio says so and offers **Trace it yourself**: the page is placed under the editor and you draw the walls over it.
- **Several pages.** When a PDF has more than one page, a strip of page thumbnails appears above the preview. Pick the page with the floor plan and it is read again from scratch.
- **Size limit.** PDFs up to 50 MB. For a larger drawing set, save the floor-plan page as its own PDF first.

### The review screen

After reading the file, Interio shows what it found before anything is created.

- **Detected plan.** The plan drawn over your drawing. Switch between **Overlay**, **Drawing** and **Plan** to compare them.
- **Low confidence.** Walls and openings the import is unsure about are drawn in amber with a dashed outline. The legend under the preview shows how many there are.
- **Summary.** Room, door and window counts, and the list of rooms with their sizes.
- **Scale.** The scale in use and where it came from. Type your own `1 : n` and press **Apply** if a known dimension looks wrong; **Automatic** goes back to the estimate.
- **Things to check.** Anything that needs a second look. Entries marked **Show** are clickable: the preview zooms to the rooms, walls or openings they refer to and outlines them. Click again, or **Show the whole plan**, to zoom back out.
- **Layers.** How each CAD layer was used. If walls are missing, find the layer that holds them and set it to **Walls**; the plan is rebuilt immediately.

### The assistant

Interio can ask an AI assistant to read room names, labelled sizes and door tags from a picture of the page. It is optional.

- **Switched on:** rooms arrive with the names printed on the drawing.
- **Switched off:** the import uses the line work only. Walls, doors and windows are still read, but room names and types are guesses that you can rename in Plan mode. Nothing leaves your computer.

To switch it on, copy `.env.example` to `.env` in the Interio folder and choose one of:

- **An Anthropic API key:** set `ANTHROPIC_API_KEY` to your key.
- **Your Claude Code login:** set `INTERIO_AI_PROVIDER=claude-code`. This needs no key, but Claude Code must be installed and signed in on the same computer, and each import counts against your Claude plan's usage.

Then restart `pnpm dev` and upload the plan again. With the assistant on, a picture of the page is sent to Anthropic.

### After the review

Press **Create project** and choose what happens next:

- **Furnish it for me** puts a suggested layout in every room and opens Design mode. One undo takes all of it back.
- **Review the plan first** opens Plan mode over your drawing, so you can fix walls, doors and room names before furnishing.

**Trace it yourself** (under the button, or in its place when no rooms were found) starts from an empty plan with your drawing underneath.

### When a file cannot be read

| Message | What to do |
|---|---|
| Not a PDF | Save the plan as a PDF from the program that opens it. |
| Password-protected | Open it with its password, then Print and Save as PDF to get an unlocked copy. |
| Damaged | Download it again, or ask for a fresh export. |
| Too large | Save just the floor-plan page as its own PDF. |

## Edit the plan

Plan mode is a 2D editor. Walls meet at shared corners, and a closed loop of walls becomes a room.

- **Draw walls.** Pick **Wall** and click corner after corner. Type a length and press Enter for an exact wall. Close the loop to finish; Esc or a double-click ends an open chain.
- **Doors and windows.** Pick **Door**, **Sliding door**, **Window** or **Passage**, hover a wall, and click. A door swings to the side the pointer is on.
- **Select and move.** With **Select**, click a wall, corner, opening or room. Drag corners, walls and openings to move them. The panel on the right shows exact sizes you can type.
- **Rooms.** Click inside a room to rename it, set its type, and choose its floor and wall finish.
- **Trace a drawing.** If the project came from a PDF, the drawing sits under the plan. Corners of the drawing attract the pointer, so a trace lands exactly on it. The controls at the bottom left hide the drawing or change its opacity.
- **Set the scale.** Pick **Set scale**, click two points a known distance apart, and type the real distance. The plan and the drawing are resized together.
- **Plan checks.** A chip at the bottom right lists problems such as walls that do not close a room.

### Plan shortcuts

| Key | Action |
|---|---|
| `V` | Select / Move |
| `H` | Pan (or hold `Space` and drag) |
| `W` | Wall |
| `D` | Door |
| `S` | Sliding door |
| `N` | Window |
| `P` | Passage |
| `X` | Split wall |
| `M` | Measure |
| `C` | Set scale |
| `Shift` | Lock the wall angle to 0, 45 or 90 degrees |
| `Alt` | Turn snapping off |
| `3400` then `Enter` | Exact wall length while drawing |
| `Esc` | End a wall chain, or clear the selection |
| `Delete` | Delete the selection |
| Arrow keys | Nudge 10 mm (`Shift` 100 mm, `Alt` 1 mm) |
| `F`, `Shift+F` | Flip a door's hinge, flip its swing |
| `+`, `-`, `0` | Zoom in, zoom out, fit the plan |
| `?` | Show the shortcuts |
| `Cmd/Ctrl+Z`, `Shift+Cmd/Ctrl+Z` | Undo, redo |

## Furnish in 3D

Design mode shows the home as a dollhouse. Drag to orbit, scroll to zoom, and use the toolbar at the top to switch between **3D** and **Top**, fit the home in view, or hide the walls that block the view.

- **Place furniture.** Pick an entry in the catalog on the left and click the floor, or drag the entry into a room. Furniture snaps to walls and turns to face the room; hold `Alt` to place it freely. Wall-mounted entries attach to the nearest wall at their mounting height.
- **Find things.** Search the catalog by name, or narrow it by category. Selecting a room narrows the catalog to what suits that room.
- **Move and turn.** Click an item to select it, then drag it. Use the panel on the right for exact rotation and elevation, to swap it for a similar entry, to duplicate it or to remove it.
- **Furnish a room for me.** Click a room's floor and press **Auto-furnish room** for a suggested layout. **Clear this room** removes its furniture.
- **Furnish the whole home.** Press **Furnish home** in the Design toolbar to fill every empty room, or choose **Furnish it for me** after an import or on the sample home. **Clear furniture** removes everything after a confirmation.
- **Overlaps.** An item that overlaps a wall or another item is flagged in its panel.

### Design shortcuts

| Key | Action |
|---|---|
| `R`, `Shift+R` | Turn 15 degrees left, right (`Alt` for 90 degrees) |
| Arrow keys | Nudge 50 mm (`Shift` 10 mm) |
| `Cmd/Ctrl+D` | Duplicate |
| `Delete` | Remove |
| `Esc` | Cancel placing, or clear the selection |
| `Cmd/Ctrl+Z`, `Shift+Cmd/Ctrl+Z` | Undo, redo |

## Finishes

Every room has a floor finish, a wall finish and a ceiling colour. The 3D view and the walkthrough show them.

- In Design mode, click a room's floor or wall and open the **Finishes** tab. Pick a floor, wall or ceiling swatch; the room updates at once.
- **Apply to all rooms** and **Apply to all rooms of this type** copy the choice across the home. **Reset to default** restores the finish that suits the room type.
- In Plan mode, click inside a room and choose **Floor finish** and **Wall finish** in the panel on the right.
- Changing a room's type in Plan mode suggests a floor finish that suits it, such as tiles for a bathroom.

## Lighting and pictures

- **Lighting.** The Design toolbar switches between **Daylight**, **Warm evening** and **Night**. The choice is saved with the project and Walk mode follows it. Lamps and ceiling lights you place light their rooms in the evening and at night.
- **Picture.** The camera button in the Design toolbar saves a high-resolution picture of the current view without the panels.

## Walk through

Walk mode puts you inside the home at eye height, starting just inside the entrance.

- **Move.** `W` `A` `S` `D` or the arrow keys. Hold `Shift` to go faster. `Q` and `E` turn.
- **Look.** Click the view to look around with the mouse; `Esc` releases the pointer. Without that, drag to look.
- **Click to move.** Turn on **Click to move** and click a point on the floor to walk there. This is the default on touch screens, where a joystick also appears.
- **Jump to a room.** Use the room list, or click a point on the minimap.
- **View options.** Field of view and eye height, a picture of the current view saved to your downloads, and full screen.

Walls and furniture block you; doors, passages and open-plan boundaries let you through.

### The guided tour

Press **Guided tour** to be walked through every room in turn. The bar at the bottom shows the room name and size, and has pause, previous room, next room, stop and a speed control. When the tour ends, **Tour again** starts it over.

## Save, export and share

- **Saving.** Projects are saved automatically in this browser. The header shows **Saved** once a change is stored. Clearing the browser's site data removes them.
- **Export.** In a project, press **Export project file** in the header. You get one `.interio` file holding the plan, the furniture, the drawing underneath it and the source PDF.
- **Open on another computer.** On the dashboard press **Open file**, or drop the `.interio` file on the page. The project opens as a copy with everything intact. Plain `.json` project files from earlier versions still open.
- **Rename, duplicate, delete.** Hover a project card on the dashboard and use the buttons at its top right. The card also shows the number of rooms, the floor area and how many items the home holds.
- **Undo.** `Cmd/Ctrl+Z` works in every mode, and the header has undo and redo buttons.

## Troubleshooting

- **Something went wrong in one mode.** The message offers **Try again** and **Back to your homes**. Your plan is not affected, and the other modes still open from the tabs in the header.
- **Rooms have the wrong names.** The assistant was off or could not read the page. Rename rooms in Plan mode.
- **Sizes look wrong.** Set the scale on the review screen, or with **Set scale** in Plan mode.
- **A room is missing.** Its walls do not close. Open Plan mode, look at the plan checks, and draw the missing piece of wall.
- **The 3D view is slow.** Close other tabs that use 3D graphics, and prefer a browser with hardware acceleration switched on.
