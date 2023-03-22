export const Factory = <T>(map: Record<string, string>, data: unknown): T => {
  const tmp: any = {}
  Object.entries(map).forEach(([from, to]) => (tmp[to] = (data as any)[from]))
  return tmp
}
