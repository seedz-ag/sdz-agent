export interface ITransport<TData = any, TResponse = void> {
  send: (resource: string, data: TData) => Promise<TResponse>;
}
