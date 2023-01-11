import { ICSV } from '@/interfaces/csv.interface'

export const CSVConsumer = ({ CSV }: { CSV: ICSV }) => async (file: string) => CSV.read(file)
