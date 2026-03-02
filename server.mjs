import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { Server } from 'socket.io'

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = createServer((req, res) => {
    try {
      const parsedUrl = parse(req.url || '', true)
      
      // INTERCEPT INTERNAL SOCKET EVENT EMISSIONS
      if (parsedUrl.pathname === '/api/internal/socket-emit' && req.method === 'POST') {
        let body = ''
        req.on('data', chunk => { body += chunk.toString() })
        req.on('end', () => {
          try {
            const data = JSON.parse(body)
            if (global.io) {
              global.io.emit(data.event, data.payload)
              console.log(`[Socket.io] Emitted ${data.event}`)
            }
            res.statusCode = 200
            res.end(JSON.stringify({ success: true }))
          } catch (e) {
            console.error('[Socket.io] Failed to emit:', e)
            res.statusCode = 400
            res.end(JSON.stringify({ error: e.message }))
          }
        })
        return
      }

      handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error occurred handling', req.url, err)
      res.statusCode = 500
      res.end('internal server error')
    }
  })

  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  })

  // We need to attach socket listener before other things catch it, but Socket.io does this automatically via `new Server(server)`.
  // The reason Next.js returns 404 for Socket.io might be ngrok headers or exact URL matching.

  global.io = io

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id)

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id)
    })
  })

  const port = process.env.PORT || 3000

  server.once('error', (err) => {
    console.error(err)
    process.exit(1)
  })

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`)
  })
})
