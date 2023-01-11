import { ICSVData, ICSVResultSet } from "../interfaces/csv.interface";

export const CSVAdapter = ({ }) => ({
  read: async (file: string): Promise<ICSVResultSet> => {
    const temp: ICSVResultSet = [];
    return temp;
  },
  write: async <T = ICSVData> (data: T, file: string): Promise<void> => {},
})