import { ICSV, ICSVResultSet } from '@/interfaces/csv.interface'

export const CSVConsumer = ({ CSV }: { CSV: ICSV }) => async <T = ICSVResultSet> (file: string) => CSV.read(file)
