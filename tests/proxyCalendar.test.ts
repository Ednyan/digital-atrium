// The site's calendar reader (functions/api/proxy-calendar.js): a calendar
// passes, inert and never cached; anything else, or a private address, doesn't.

import { test } from 'node:test'
import assert from 'node:assert/strict'

// @ts-expect-error -- a plain JS Pages Function
import { onRequest } from '../functions/api/proxy-calendar.js'

const ask = (url: string) => onRequest({ request: new Request(`https://digitalatrium.org/api/proxy-calendar?url=${encodeURIComponent(url)}`) })
const answering = (body: string, status = 200) => { (globalThis as any).fetch = async () => new Response(body, { status }) }

test('a calendar passes, as text that does nothing, never kept', async () => {
  answering('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n')
  const answer = await ask('webcal://calendar.example.org/me.ics')
  assert.equal(answer.status, 200)
  assert.match(answer.headers.get('content-type')!, /^text\/plain/)
  assert.equal(answer.headers.get('cache-control'), 'no-store')
  assert.equal(answer.headers.get('x-content-type-options'), 'nosniff')
  assert.match(await answer.text(), /^BEGIN:VCALENDAR/)
})

test('a page, or a private address, is refused', async () => {
  answering('<html><script>alert(1)</script></html>')
  assert.equal((await ask('https://example.org/page')).status, 422)
  assert.equal((await ask('http://127.0.0.1/c.ics')).status, 403)
  assert.equal((await ask('http://192.168.1.4/c.ics')).status, 403)
  assert.equal((await ask('file:///etc/passwd')).status, 400)
  answering('nope', 404)
  assert.equal((await ask('https://example.org/gone.ics')).status, 424)
})
