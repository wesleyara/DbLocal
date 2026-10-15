import { run } from '../../connections/http'
import { openDemo } from '../../demo/demo-service'
import { demoDeps } from '../../demo/deps'

/** `POST /api/demo/reset` -> recreates the demo file from the seed, discarding every edit. */
export default defineEventHandler(() => run(() => openDemo(demoDeps(), { reset: true })))
