export interface ICommand<TArgs = any, TReturn = void> {
  execute: (args: TArgs) => Promise<TReturn>;
  rescue?: (error: Error) => Promise<void>;
}
