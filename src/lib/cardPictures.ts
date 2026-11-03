// A copy of each atrium's picture outside the browser's vault, for Home to show
// without opening it. The vault is one tab's at a time: Home holding it would keep
// every other tab of the site from opening an atrium, so it only reads this. Kept
// as the picture is made or read from the vault (AtriumPicture, lib/atriumPreview);
// a card with none kept yet shows its picture once Atriums has been opened.

const CACHE = 'atrium-card-pictures'
// A key the cache takes: the picture's vault address, as a path.
const keyOf = (url: string) => `https://atrium.cards/${encodeURIComponent(url)}`

export async function keepCardPicture(url: string, picture: Blob): Promise<void> {
  try {
    const cache = await caches.open(CACHE)
    await cache.put(keyOf(url), new Response(picture, { headers: { 'Content-Type': picture.type || 'image/webp' } }))
  } catch { /* shown from the vault, when it's open */ }
}

export async function cardPicture(url: string): Promise<Blob | null> {
  try {
    const answer = await (await caches.open(CACHE)).match(keyOf(url))
    return answer ? await answer.blob() : null
  } catch {
    return null
  }
}
