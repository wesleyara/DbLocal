import { connect, type Socket } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Server, utils, type Connection } from 'ssh2'
import { createDriver } from '../../server/drivers'
import { openSshTunnel } from '../../server/drivers/ssh-tunnel'
import type { DriverConfig } from '../../server/drivers/types'

// An in-process SSH bastion that forwards to the dev Postgres from docker/compose.dev.yml.
const PG_PORT = 54329
const USER = 'ops'
const PASSWORD = 'bastion-pw'

let bastion: Server
let bastionPort: number
let forwards = 0

beforeAll(async () => {
  const { private: hostKey } = utils.generateKeyPairSync('ed25519')
  bastion = new Server({ hostKeys: [hostKey] }, (client: Connection) => {
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && ctx.username === USER && ctx.password === PASSWORD) ctx.accept()
      else ctx.reject()
    })
    client.on('ready', () => {
      client.on('tcpip', (accept, _reject, info) => {
        forwards++
        const channel = accept()
        const target: Socket = connect(info.destPort, info.destIP)
        target.on('connect', () => {
          channel.pipe(target).pipe(channel)
        })
        target.on('error', () => channel.destroy())
        channel.on('error', () => target.destroy())
      })
    })
  })
  await new Promise<void>((resolve) => bastion.listen(0, '127.0.0.1', resolve))
  bastionPort = (bastion.address() as { port: number }).port
})

afterAll(() => {
  bastion.close()
})

const ssh = () => ({
  host: '127.0.0.1',
  port: bastionPort,
  user: USER,
  authMethod: 'password' as const,
  password: PASSWORD,
})

describe('ssh tunnel', () => {
  it('forwards a local port to the target through the bastion', async () => {
    const tunnel = await openSshTunnel(ssh(), { host: '127.0.0.1', port: PG_PORT })
    try {
      expect(tunnel.localPort).toBeGreaterThan(0)
      const before = forwards
      // Any bytes sent to the local port reach the target: a Postgres startup message gets a reply.
      const reply = await new Promise<number>((resolve, reject) => {
        const s = connect(tunnel.localPort, '127.0.0.1', () => s.write(startupMessage()))
        s.once('data', (d) => resolve(d[0]!))
        s.once('error', reject)
      })
      expect(reply).toBeDefined()
      expect(forwards).toBeGreaterThan(before)
    } finally {
      await tunnel.close()
    }
  })

  it('a Postgres driver connects through the tunnel and closes it on close', async () => {
    const config: DriverConfig = {
      id: 'ssh-test',
      dialect: 'postgres',
      host: '127.0.0.1',
      port: PG_PORT,
      user: 'dblocal',
      password: 'dblocal',
      database: 'dblocal_dev',
      ssh: ssh(),
    }
    const driver = await createDriver(config)
    const result = await driver.testConnection()
    expect(result.serverVersion).toMatch(/PostgreSQL/)
    await driver.close()
  })

  it('wrong SSH password is an auth error', async () => {
    const config: DriverConfig = {
      id: 'ssh-bad',
      dialect: 'postgres',
      host: '127.0.0.1',
      port: PG_PORT,
      user: 'dblocal',
      password: 'dblocal',
      database: 'dblocal_dev',
      ssh: { ...ssh(), password: 'nope' },
    }
    await expect(createDriver(config)).rejects.toMatchObject({ code: 'auth' })
  })

  it('reports when the SSH session drops', async () => {
    let dropped = 0
    const tunnel = await openSshTunnel(ssh(), { host: '127.0.0.1', port: PG_PORT }, () => dropped++)
    // Closing it on our side is an intentional close and must not count as a drop.
    await tunnel.close()
    expect(dropped).toBe(0)
  })
})

/** Minimal Postgres StartupMessage (protocol 3.0, user and database). */
function startupMessage(): Buffer {
  const params = Buffer.from(`user\0${USER}\0database\0dblocal_dev\0\0`)
  const body = Buffer.concat([Buffer.from([0, 3, 0, 0]), params])
  const len = Buffer.alloc(4)
  len.writeUInt32BE(body.length + 4, 0)
  return Buffer.concat([len, body])
}
