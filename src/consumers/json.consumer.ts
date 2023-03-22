export const JSONConsumer = async <T>(data: T): Promise<T> => typeof data === 'string' ? JSON.parse(data) : data
