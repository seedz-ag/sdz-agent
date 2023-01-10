import { ICSV } from "@/interfaces/csv.interface";

export const CSVConsumer = ({ CSV }: { CSV: ICSV }) => (file: string): Promise<Record<string, string | number | boolean>[]> => CSV.read(file)