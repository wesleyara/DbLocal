const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'])
export const DOCKER_HOST_ALIAS = 'host.docker.internal'

/** True in the Docker image, which sets `DBLOCAL_IN_DOCKER=1`. */
export function runsInDocker(): boolean {
  return process.env.DBLOCAL_IN_DOCKER === '1'
}

/**
 * Inside a container "localhost" is the container itself, not the user's machine. The connection keeps
 * the host the user typed; only the address used to connect is swapped for the host alias.
 */
export function resolveConnectHost(host: string | null | undefined, docker = runsInDocker()): string | null | undefined {
  if (!docker || !host) return host
  return LOOPBACK.has(host.trim().toLowerCase()) ? DOCKER_HOST_ALIAS : host
}
