import { ICSVAdapter, ICSVResultSet } from '@/interfaces/csv.interface'

export const CSVConsumer = ({ CSV }: { CSV: ICSVAdapter }) => async (data: string): Promise<ICSVResultSet> => CSV.parse(data)
