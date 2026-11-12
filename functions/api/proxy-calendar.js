// Cloudflare Pages Function
// Path: /api/proxy-calendar
//
// A calendar's iCal address (Google's secret address, Outlook's published
// .ics, a webcal:// link) read for a calendar trace (src/lib/calendarLink.ts):
// those hosts don't let a page read them itself. Only a calendar is passed on
// -- what doesn't start as one is refused -- so this is no proxy for anything
// else; it's never kept (each read is the calendar now); and it goes out as
// plain text to download, never as something the site would run.

const MOST_BYTES = 5 * 1024 * 1024
const CORS = { 'Access-Control-Allow-Origin': '*' }
const refuse = (status, words) => new Response(words, { status, headers: { ...CORS, 'Cache-Control': 'no-store' } })

export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET, OPTIONS' } })
  }
  if (request.method !== 'GET') return refuse(405, 'GET only')

  let link
  try {
    link = new URL((new URL(request.url).searchParams.get('url') || '').replace(/^webcal:/i, 'https:'))
  } catch {
    return refuse(400, 'Not an address')
  }
  if (link.protocol !== 'https:' && link.protocol !== 'http:') return refuse(400, 'Not a web address')
  // Never a machine's own or a private network's address, written as numbers or as localhost.
  if (/^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(link.hostname)) return refuse(403, 'Not a public address')

  try {
    const answer = await fetch(link.toString(), { headers: { 'User-Agent': 'The Digital Atrium calendar reader', Accept: 'text/calendar, text/plain;q=0.8, */*;q=0.1' }, redirect: 'follow' })
    if (!answer.ok) return refuse(502, `The calendar answered ${answer.status}`)
    const length = Number(answer.headers.get('content-length') || 0)
    if (length > MOST_BYTES) return refuse(413, 'That calendar is too large')
    const bytes = await answer.arrayBuffer()
    if (bytes.byteLength > MOST_BYTES) return refuse(413, 'That calendar is too large')
    const start = new TextDecoder().decode(bytes.slice(0, 64)).replace(/^﻿/, '').trimStart()
    if (!/^BEGIN:VCALENDAR/i.test(start)) return refuse(422, 'That address is not a calendar')
    return new Response(bytes, {
      headers: {
        ...CORS,
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Content-Disposition': 'attachment; filename="calendar.ics"',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return refuse(502, 'The calendar could not be read: ' + (error && error.message ? error.message : 'no answer'))
  }
}
