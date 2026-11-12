---
id: 3d-models
title: 3D models
section: 3.3 Bringing things in > Pictures and media
summary: Drop a GLB, glTF, FBX, OBJ or STL file (with its textures) to place a 3D model; double-click it to turn, move and zoom it, pose its skeleton, light it, colour it, take a snapshot, and keep the view you like.
keywords: 3d, 3d model, model, glb, gltf, fbx, obj, mtl, stl, mesh, blender, sculpt, turn, rotate, orbit, spin, pan, move, zoom, snapshot, render, transparent, reference, figure, prop, texture, textures, light, lighting, exposure, colour, color, pose, posing, rig, rigged, skeleton, bone, bones, joint, armature
where: Drop a model file on the canvas, or the quick bar's Other > 3D model (a cube, then Choose a model file…); double-click it, its Turn in 3D button, or right-click > Turn in 3D; Customization panel > 3D model
works_on: web, desktop
related: pictures, drop-and-paste, exr-grading, customization-panel
video: planned
---

# 3D models

Drop a 3D model on the canvas. Or press **Other** > **3D model** on the quick bar
(or right-click the canvas > **3D model**): a cube is placed, and **Choose a model
file…** in its Customization panel puts your model in its place.

It shows as a still picture of the model with nothing behind it, and keeps the
model file so you can turn it.

Files: **.glb**, **.gltf**, **.fbx**, **.obj**, **.stl**.

**Its textures:** drop them with it, all at once (select the model and its
files together: the .png/.jpg textures, an .obj's **.mtl**, a .gltf's **.bin**).
They're read into the model, kept with it as one **.glb**, and not placed as
pictures of their own.

## Turn it

Double-click it, press **Turn in 3D** on it when it's selected, or right-click
it > **Turn in 3D**.

![A model turning in place: Drag to turn, scroll to zoom, then SNAPSHOT, RESET VIEW and DONE above it](../images/3d-models-turn.webp)

| You want | Do this |
|---|---|
| Turn it | Drag on it |
| Move it in its box | Right-drag (or **Shift**+drag) |
| Nearer or further | Scroll on it |
| Your last move back, or on again | **Ctrl+Z**, **Ctrl+Shift+Z** |
| A picture of this view, beside it | **Snapshot** |
| Back to how it arrived | **Reset view** |
| Keep this view | **Done**, **Escape**, or click anywhere else |

Done, the model's picture becomes the new view: one step, **Ctrl+Z** takes it
back. Only one model turns at a time.

**Full screen** takes it out of its box onto the whole window, to work on it
there; **Back to the trace**, **Escape** or a click beside it puts it back.

## Pose it

A model with a skeleton (a rigged character, an armature) shows **Pose** while
it's turning. Press it: its joints show as dots, its root is chosen, and a strip
of tools shows down its left: **Move and rotate**, **Move**, **Rotate**, **Scale**.

| You want | Do this |
|---|---|
| Another joint | Click its dot, or pick its bone from the list |
| Turn it | **Rotate**, then drag the rings (each turns about one axis; the middle turns freely) |
| Move it | **Move**, then drag the arrows (one axis), a square (a plane) or the middle (freely) |
| Make it bigger or smaller | **Scale**, then drag its handles |
| Move and turn at once | **Move and rotate**: the arrows outside, the rings inside |
| Your last turn back, or on again | **Ctrl+Z**, **Ctrl+Shift+Z** |
| Back to its rest pose | **Reset pose** |

**Done** keeps the pose with the view: one step, **Ctrl+Z** takes it back. Its
picture, and any new one made by its light or colour, shows it posed.

## Light and colour

Customize it, then the **3D model** section:

| Control | What it does |
|---|---|
| **Light** | **Studio**, **Soft**, **Sun** or **Night** (a cold light from behind it) |
| **Exposure** | Brighter or darker; kept when you let go |
| **Textures** | On, the pictures on its surfaces show; off, it's all one material. On by default when it came with textures |
| **Colour** | With its textures off: its colour. **Reset** gives its parts their own back |
| **Choose a model file…** | Another model in its place (with its textures, chosen together) |

Each change makes its picture again: one step, **Ctrl+Z** takes it back. While
it's turning, you see the change there too.

## Good to know

- A .gltf missing its .bin can't be read: drop the .bin with it, or export it as **.glb**, one file.
- A Draco-compressed model can't be read yet.
- An .obj without its .mtl, an .stl, or any model without textures is grey, its textures off: give it a **Colour**.
- Animations don't play: a model shows its rest pose, or the pose you give it.
- Everything else a picture can do (crop, flip, export) works on it, from its picture. See [Pictures](pictures.md).

## Related

- [Pictures](pictures.md): what any picture can do.
- [Drop and paste](drop-and-paste.md): bringing files in.
- [EXR pictures and grading](exr-grading.md): another file kept beside its picture.
