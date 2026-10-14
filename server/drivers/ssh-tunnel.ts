import { createServer, type Server, type Socket } from 'node:net'
import { Client, type ConnectConfig } from 'ssh2'
import { DriverError, NETWORK_ERROR_CODES, messageOf } from './errors'
import type { SshOptions } from './types'

const READY_TIMEOUT_MS = 10_000

export interface SshTunnel {
  /** Local port on 127.0.0.1 that forwards to the target host through the bastion. */
  readonly localPort: number
  close(): Promise<void>
}

/** Maps an ssh2 connect error to a normalised DriverError. */
export function mapSshError(err: unknown): DriverError {
  const code = (err as { code?: string })?.code
  const message = messageOf(err)
  const level = (err as { level?: string })?.level
  if (level === 'client-authentication') return new DriverError('auth', 'SSH authentication failed', err)
  if (/timed out|timeout/i.test(message)) return new DriverError('timeout', `SSH: ${message}`, err)
  if (code && NETWORK_ERROR_CODES.has(code)) return new DriverError('network', `SSH: ${message}`, err)
  return new DriverError('network', `SSH: ${message}`, err)
}

/**
 * Opens an SSH connection to the bastion and forwards a random local port to `target`.
 * `onClose` runs when the SSH session drops, so the owner can rebuild the pools that used it.
 */
export async function openSshTunnel(
  ssh: SshOptions,
  target: { host: string; port: number },
  onClose?: () => void,
): Promise<SshTunnel> {
  const client = new Client()
  let closed = false

  const connectConfig: ConnectConfig = {
    host: ssh.host,
    port: ssh.port,
    username: ssh.user,
    readyTimeout: READY_TIMEOUT_MS,
    ...(ssh.authMethod === 'key'
      ? { privateKey: ssh.privateKey, passphrase: ssh.passphrase }
      : { password: ssh.password }),
  }

  await new Promise<void>((resolve, reject) => {
    client.once('ready', resolve)
    client.once('error', (err) => reject(mapSshError(err)))
    client.connect(connectConfig)
  })

  const server: Server = createServer((socket: Socket) => {
    client.forwardOut('127.0.0.1', localPort(server), target.host, target.port, (err, stream) => {
      if (err) {
        socket.destroy()
        return
      }
      socket.pipe(stream).pipe(socket)
      stream.on('error', () => socket.destroy())
      socket.on('error', () => stream.destroy())
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  client.on('close', () => {
    if (closed) return
    closed = true
    server.close()
    onClose?.()
  })
  // Errors after the handshake are followed by a close event, which is where the owner reacts.
  client.on('error', () => {})

  return {
    get localPort() {
      return localPort(server)
    },
    async close() {
      if (closed) return
      closed = true
      server.close()
      client.end()
    },
  }
}

function localPort(server: Server): number {
  const address = server.address()
  if (!address || typeof address === 'string') throw new DriverError('unknown', 'SSH tunnel is not listening')
  return address.port
}
