import { Socket } from "socket.io-client";

export default async (socket: Socket, CREDENTIALS: any): Promise<boolean> => {
  return new Promise((resolve) => {
      require(`../src/bootstrap.ts`);
      resolve(true);
  });
};
