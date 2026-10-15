import { run } from '../../connections/http'
import { openDemo } from '../../demo/demo-service'
import { demoDeps } from '../../demo/deps'

/** `POST /api/demo` -> the demo connection, created (and its SQLite file copied) on first use. */
export default defineEventHandler(() => run(() => openDemo(demoDeps())))
