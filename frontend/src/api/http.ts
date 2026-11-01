import axios, { AxiosError, type AxiosRequestConfig } from 'axios'

export const API_URL: string = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

const ACCESS_KEY = 'wms.access'
const REFRESH_KEY = 'wms.refresh'

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export const tokens = {
  get access() {
    return storage()?.getItem(ACCESS_KEY) ?? null
  },
  get refresh() {
    return storage()?.getItem(REFRESH_KEY) ?? null
  },
  set(access: string, refresh?: string) {
    storage()?.setItem(ACCESS_KEY, access)
    if (refresh) storage()?.setItem(REFRESH_KEY, refresh)
  },
  clear() {
    storage()?.removeItem(ACCESS_KEY)
    storage()?.removeItem(REFRESH_KEY)
  },
}

/** The session can no longer be refreshed; the user has to log in again. */
export class AuthExpiredError extends Error {
  constructor() {
    super('Your session has expired. Please log in again.')
    this.name = 'AuthExpiredError'
  }
}

type AuthListener = () => void
const authExpiredListeners = new Set<AuthListener>()
export function onAuthExpired(listener: AuthListener): () => void {
  authExpiredListeners.add(listener)
  return () => authExpiredListeners.delete(listener)
}

export const http = axios.create({ baseURL: API_URL, timeout: 15_000 })

http.interceptors.request.use((config) => {
  const access = tokens.access
  if (access && !config.headers.Authorization) config.headers.Authorization = `Bearer ${access}`
  return config
})

let refreshing: Promise<string> | null = null

/** Single-flight refresh: concurrent 401s share one refresh request. */
export function refreshAccessToken(): Promise<string> {
  if (!refreshing) {
    refreshing = (async () => {
      const refresh = tokens.refresh
      if (!refresh) throw new AuthExpiredError()
      try {
        const { data } = await axios.post(`${API_URL}/auth/token/refresh/`, { refresh }, { timeout: 15_000 })
        tokens.set(data.access, data.refresh)
        return data.access as string
      } catch (err) {
        const status = (err as AxiosError).response?.status
        // Only a definite rejection of the refresh token ends the session;
        // a network error during refresh is just a temporary failure.
        if (status === 400 || status === 401) {
          tokens.clear()
          throw new AuthExpiredError()
        }
        throw err
      }
    })().finally(() => {
      refreshing = null
    })
  }
  return refreshing
}

http.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined
  if (error.response?.status !== 401 || !config || config._retried) throw error
  config._retried = true
  try {
    const access = await refreshAccessToken()
    config.headers = { ...config.headers, Authorization: `Bearer ${access}` }
    return http(config)
  } catch (refreshError) {
    if (refreshError instanceof AuthExpiredError) authExpiredListeners.forEach((l) => l())
    throw refreshError
  }
})

/** Human-readable message for an API error. */
export function errorMessage(err: unknown): string {
  if (err instanceof AuthExpiredError) return err.message
  if (axios.isAxiosError(err)) {
    if (!err.response) return 'Cannot reach the server.'
    const data = err.response.data as Record<string, unknown> | undefined
    if (data && typeof data === 'object') {
      if (typeof data.detail === 'string') return data.detail
      const first = Object.entries(data)[0]
      if (first) return `${first[0]}: ${Array.isArray(first[1]) ? first[1].join(' ') : String(first[1])}`
    }
    return `Server error (${err.response.status}).`
  }
  return err instanceof Error ? err.message : String(err)
}
