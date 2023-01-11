import { ICSVAdapter, ICSVResultSet } from '@/interfaces/csv.interface'

export const CSVConsumer = ({ CSV }: { CSV: ICSVAdapter }) => async (file: string): Promise<ICSVResultSet> => CSV.read(file)
