---
id: browser-extension
title: Send to Atrium (browser extension)
section: 3.5 Bringing things in > From elsewhere
summary: A browser extension that sends a picture, a link, a page or a selection from any website into the atrium you have open. Installed by hand for now.
keywords: extension, browser extension, add-on, chrome, edge, firefox, brave, send to atrium, right-click, save image, clip, web clipper
where: Your browser's right-click menu on any website
works_on: web
related: drop-and-paste, embeds-and-links, pictures
video:
---

# Send to Atrium (browser extension)

**Send to Atrium** adds to your browser's right-click menu on any website:

| Right-click | Choose | It arrives as |
|---|---|---|
| A picture | **Send image to atrium** | A picture |
| A link | **Send link to atrium** | An embed |
| The page itself | **Send this page to atrium** | An embed |
| Selected text | **as text**, or **as embed** if it's an address | Text, or an embed |

What you send lands in the middle of your view, in the atrium you have open.

## Before you send

Open digitalatrium.org in a tab and go into an atrium, signed in, where you can
edit. With several atrium tabs open, it goes to the one you used last.

## Install it

It isn't in the browsers' stores yet, so it's installed by hand from the
`extension` folder of the Atrium's public repository on GitHub
(Ednyan/digital-atrium).

**Chrome, Edge, Brave, Opera, Vivaldi**

1. Download the `extension` folder.
2. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
3. **Load unpacked**, and choose the folder.

**Firefox** needs its own build of it, and loads it only until Firefox
restarts. Safari isn't supported.

## Good to know

- The extension holds no password and uploads nothing: it tells the open atrium tab what you right-clicked, and the atrium makes the trace.
- The address bar can't be right-clicked into by any extension: right-click the page instead.

## Related

- [Drop and paste](drop-and-paste.md): bringing things in without the extension.
- [Embeds and links](embeds-and-links.md): what a link becomes.
