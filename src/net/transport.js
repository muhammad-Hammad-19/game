// Two players, one link. Online play uses a WebRTC data channel (PeerJS handles the
// introduction); `?net=local` swaps in a BroadcastChannel so two tabs can be tested offline.
const PREFIX = 'boundary-bash-v1-'
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function makeCode() {
  let code = ''
  for (let i = 0; i < 5; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return code
}

export const cleanCode = text => text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)

function emitter() {
  const handlers = { message: () => {}, open: () => {}, close: () => {} }
  return {
    handlers,
    on(name, handler) { handlers[name] = handler },
  }
}

function localLink(code, host) {
  const { handlers, on } = emitter()
  const channel = new BroadcastChannel(PREFIX + code)
  const me = host ? 'host' : 'guest'
  let open = false
  let closed = false
  channel.onmessage = ({ data }) => {
    if (closed || data.from === me) return
    if (data.sys === 'hello') {
      if (!open) { open = true; channel.postMessage({ from: me, sys: 'hello' }); handlers.open() }
    } else if (data.sys === 'bye') {
      if (open) { open = false; handlers.close() }
    } else if (open) {
      handlers.message(data.body)
    }
  }
  if (!host) channel.postMessage({ from: me, sys: 'hello' })
  return {
    code, host, on,
    send(body) { if (open && !closed) channel.postMessage({ from: me, body }) },
    close() {
      if (closed) return
      closed = true
      channel.postMessage({ from: me, sys: 'bye' })
      channel.close()
    },
  }
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

// The introduction server. By default this is the free public PeerJS service; set
// VITE_PEER_SERVER=host:port (or add ?peer=host:port while testing) to use your own.
function serverOptions() {
  const custom = new URLSearchParams(window.location.search).get('peer') || import.meta.env?.VITE_PEER_SERVER
  if (!custom) return undefined
  const [host, port] = custom.replace(/^\w+:\/\//, '').split(':')
  const local = host === 'localhost' || host === '127.0.0.1'
  return { host, port: Number(port) || (local ? 9000 : 443), path: '/', secure: !local }
}

// The public introduction service drops connections now and then, so try a few times.
async function openPeer(Peer, id) {
  let failure
  for (let attempt = 0; attempt < 3; attempt++) {
    const options = serverOptions()
    const peer = id ? new Peer(id, options) : new Peer(options)
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), 10000)
        peer.once('open', () => { clearTimeout(timer); resolve() })
        peer.once('error', error => { clearTimeout(timer); reject(error) })
      })
      return peer
    } catch (error) {
      failure = error
      try { peer.destroy() } catch {}
      if (error?.type === 'unavailable-id') break
      await pause(700 * (attempt + 1))
    }
  }
  throw new Error(failure?.type === 'unavailable-id' ? 'That room code is in use. Try again.'
    : 'Could not reach the matchmaking service. Check your connection and try again.')
}

async function peerLink(code, host) {
  const { Peer } = await import('peerjs')
  const { handlers, on } = emitter()
  let connection
  let closed = false
  const peer = await openPeer(Peer, host ? PREFIX + code : undefined)
  const attach = conn => {
    connection = conn
    conn.on('open', () => handlers.open())
    conn.on('data', data => handlers.message(data))
    conn.on('close', () => { if (!closed) handlers.close() })
    conn.on('error', () => { if (!closed) handlers.close() })
  }
  peer.on('error', error => {
    if (closed) return
    if (error?.type === 'peer-unavailable') handlers.close(new Error('No room with that code was found.'))
  })
  if (host) {
    peer.on('connection', conn => {
      // One opponent per room.
      if (connection) { conn.close(); return }
      attach(conn)
    })
  } else {
    attach(peer.connect(PREFIX + code, { reliable: true }))
  }
  // Losing the introduction service does not matter once the two players are linked.
  peer.on('disconnected', () => { if (!closed && !connection?.open) { try { peer.reconnect() } catch {} } })
  return {
    code, host, on,
    send(body) { if (connection?.open) connection.send(body) },
    close() {
      closed = true
      try { connection?.close() } catch {}
      try { peer.destroy() } catch {}
    },
  }
}

export function openLink(code, host) {
  const local = new URLSearchParams(window.location.search).get('net') === 'local'
  return local ? Promise.resolve(localLink(code, host)) : peerLink(code, host)
}
