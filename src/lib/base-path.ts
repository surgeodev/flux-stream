export const BASE_PATH =
  typeof window !== 'undefined' && window.location.pathname.startsWith('/flux-stream')
    ? '/flux-stream'
    : ''

export function withBase(path: string): string {
  return `${BASE_PATH}${path}`
}
