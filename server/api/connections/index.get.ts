import { listConnections } from '../../connections/repository'
import { run } from '../../connections/http'
import { useStore } from '../../store/db'

export default defineEventHandler(() => run(() => listConnections(useStore())))
