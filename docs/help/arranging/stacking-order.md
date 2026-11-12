---
id: stacking-order
title: Stacking order
section: 4.2 Arranging > Organizing
summary: What's on top of what. Groups and loose traces share one stack; move a trace up, down, to the top or to the bottom, from its menu, its Customization panel, or the Layers panel.
keywords: stacking, order, layer order, z-order, z-index, on top, in front, behind, bring to front, send to back, bring forward, send backward, move up, move down, move to top, move to bottom, overlap
where: Right-click a trace > Move Layer; Customization panel > Arrange > Order; Layers panel
works_on: web, desktop, phone
related: groups-and-layers, frames, copy-duplicate-delete, customization-panel
video:
---

# Stacking order

Where traces overlap, the one higher in the stack is drawn on top. Groups and
traces in no group share one stack, so a loose trace can sit between two
groups. Inside a group, its traces have an order of their own.

A new trace goes on top of everything.

## Move a trace in the stack

Right-click it > **Move Layer**:

![Move Layer: Move Up, Move Down, Move to Top, Move to Bottom](../images/move-layer.png)

| Choose | It goes |
|---|---|
| **Move Up** | Over the one above it |
| **Move Down** | Under the one below it |
| **Move to Top** | Over everything; in a group, **Move to Top of Group** |
| **Move to Bottom** | Under everything; in a group, **Move to Bottom of Group** |

The same four are buttons under **Order** in its Customization panel's
**Arrange** section, and in the panel's footer.

## In the Layers panel

The Layers panel lists the stack, top first. Drag a trace or a group up or
down the list to move it; drop it on a group to put it inside. See
[Groups and the Layers panel](groups-and-layers.md).

## Good to know

- Several selected traces move together: right-click one of them, or use the panel's footer.
- A trace alone in its group has nothing to move past: **Move Layer** doesn't show.

## Related

- [Groups and the Layers panel](groups-and-layers.md): the stack as a list.
- [Frames](frames.md): boxes that hold traces.
- [The Customization panel](../making-it-look-right/customization-panel.md): its Arrange section.
