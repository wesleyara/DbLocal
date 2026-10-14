import { run } from '../../connections/http'
import { getConnection } from '../../connections/repository'
import { useStore } from '../../store/db'

export default defineEventHandler((event) => run(() => getConnection(useStore(), getRouterParam(event, 'id')!)))
