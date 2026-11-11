// Child-only fix for mcp-remote's OAuth callback shutdown. Browser preconnects
// have sent no request, so Node's server.close() may wait forever for them.
// Drain only unused loopback sockets; leave callback/long-poll responses alone.
const { Server } = require('node:http')
const socketsByServer = new WeakMap()
const listen = Server.prototype.listen
const close = Server.prototype.close
Server.prototype.listen = function (...args) {
  if (!socketsByServer.has(this)) {
    const sockets = new Set()
    socketsByServer.set(this, sockets)
    this.on('connection', socket => {
      sockets.add(socket)
      socket.once('close', () => sockets.delete(socket))
    })
  }
  return Reflect.apply(listen, this, args)
}
Server.prototype.close = function (...args) {
  const address = this.address()
  const loopback = address && typeof address === 'object' && ['127.0.0.1', '::1'].includes(address.address)
  const result = Reflect.apply(close, this, args)
  if (loopback) for (const socket of socketsByServer.get(this) ?? []) {
    if (socket.bytesRead === 0) socket.destroy()
  }
  return result
}
