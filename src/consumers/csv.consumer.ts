import { ICSV } from '@/interfaces/csv.interface'

export const CSVConsumer = ({ CSV }: { CSV: ICSV }) => async (file: string): Promise<Array<Record<string, string | number | boolean>>> => CSV.read(file)
