---
id: 3d-models
title: 3D models
section: 3.3 Bringing things in > Pictures and media
summary: Drop a GLB, glTF, FBX, OBJ, STL, Collada or VRM file (with its textures) to place a 3D model; double-click it to turn, move and zoom it, move, turn or scale it and its parts, pose its skeleton (IK with a pole, ready-made poses for any person), light it, colour it, take a snapshot, and keep the view you like.
keywords: 3d, 3d model, model, glb, gltf, fbx, obj, mtl, stl, dae, collada, vrm, avatar, vroid, mixamo, mannequin, quaternius, ik, pole, knee, elbow, part, parts, mesh, blender, sculpt, turn, rotate, orbit, spin, pan, move, zoom, snapshot, render, transparent, reference, figure, prop, texture, textures, light, lighting, exposure, colour, color, pose, posing, rig, rigged, skeleton, bone, bones, joint, armature
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

**Start from** in its 3D model section swaps it for one of the Atrium's own: a
**Cube**, **Sphere**, **Cylinder** or **Cone**, or a **Mannequin** (man or
woman, by Quaternius, free to use: CC0) standing, to pose.

Files: **.glb**, **.gltf**, **.fbx** (7.0 or newer), **.obj**, **.stl**, **.dae**
(Collada), **.vrm** (an avatar: VRoid and the like).

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

## Move, turn or scale it

The strip of tools down its left, while it's turning:

| Tool | What dragging does |
|---|---|
| **View** (the arrow) | Turns the view: nothing on it changes |
| **Move and rotate** | The arrows outside move it, the rings inside turn it |
| **Move** | The arrows (one axis), a square (a plane) or the middle (freely) |
| **Rotate** | The rings: each turns about one axis, the middle turns freely |
| **Scale** | Its handles |

With any tool but View, they work on the whole model, or on the part you click
(a model of several pieces: the part list shows them too). **Reset parts** puts
every part back as it came. **Done** keeps them with the view: one step,
**Ctrl+Z** takes it back.

## Pose it

A model with a skeleton (a rigged character, an armature) shows **Pose** while
it's turning. Press it: its joints show as dots, its root is chosen, and the
tools work on joints.

| You want | Do this |
|---|---|
| Another joint | Click its dot, or pick its bone from the list |
| Turn, move or scale it | The tools above, on the joint |
| A ready-made pose | **Poses**: standing, relaxed, T-pose, A-pose, walking, running, sitting, kneeling, thinking, waving, reaching up |
| Your last change back, or on again | **Ctrl+Z**, **Ctrl+Shift+Z** |
| Back to its rest pose | **Reset pose** |

**Poses** shows for any model whose skeleton is a person's: the mannequins,
Mixamo characters, VRM avatars, Unreal, Blender (Rigify) and Character Creator
rigs. Its bones are found by their names (hips, spine, upper arm, forearm,
thigh, calf...); a skeleton named some other way has no Poses, but poses by hand.

**IK** (on at first): moving a joint turns the bones above it, so it can get
there; a hand dragged bends the elbow and the shoulder, and nothing comes apart.
How many bones follow: the list beside it (**2 above** by default).

With 2 above (an arm, a leg), a blue **diamond** shows: the **pole**. The knee or
elbow bends toward it. Click it, then drag its arrows to set which way the limb
bends; the hand or foot stays where it is. A straight knee starts bending
forward, a straight elbow back. With IK off, **Move** moves the joint alone.

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
- An FBX older than 7.0 (some Mixamo downloads are 6.1) can't be read: download it again as **FBX for Unity** or **Collada (.dae)**, or export it as **.glb**.
- A VRM shows as plainly lit as any model: its toon shading, expressions and swinging hair aren't read.
- An .obj without its .mtl, an .stl, or any model without textures is grey, its textures off: give it a **Colour**.
- Animations don't play: a model shows its rest pose, or the pose you give it.
- Everything else a picture can do (crop, flip, export) works on it, from its picture. See [Pictures](pictures.md).

## Related

- [Pictures](pictures.md): what any picture can do.
- [Drop and paste](drop-and-paste.md): bringing files in.
- [EXR pictures and grading](exr-grading.md): another file kept beside its picture.
