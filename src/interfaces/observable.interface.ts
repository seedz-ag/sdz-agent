export interface Observable<T> {
  promise: Promise<T>
  subscribe: (callback: (data: T) => void) => void
}
