import { config } from "dotenv";
import { argv } from "process";
import { singleton } from "tsyringe";
import { z } from "zod";

const environmentSchema = z.object({
  ...(argv.includes("configure")
    ? {}
    : {
        API_URL: z.string().url(),
        CLIENT_ID: z.string(),
        CLIENT_SECRET: z.string(),
      }),
  CHUNK_SIZE: z
    .string()
    .optional()
    .transform((value: unknown) => Number(value)),
  ENV: z.enum(["DEV", "SND", "PRD"]).optional(),
  EXTRACT_LAST_N_DAYS: z
    .string()
    .optional()
    .transform((value: unknown) => Number(value)),
  FOREVER: z
    .string()
    .optional()
    .transform((value: unknown) => "true" === value || true === value || false),
  QUERY: z.string().optional(),
  RETRIES: z
    .string()
    .default("3")
    .transform((value: unknown) => Number(value)),
  RAW_ONLY: z
    .string()
    .optional()
    .transform((value: unknown) => "true" === value || true === value || false),
  SCHEMA: z.string().optional(),
  THROTTLE: z
    .string()
    .optional()
    .default("0")
    .transform((value: unknown) => Number(value)),
  TYPE: z.string().optional(),
  USE_CONSOLE_LOG: z
    .string()
    .optional()
    .transform((value: unknown) => "true" === value || true === value || false),
  VERBOSE: z
    .string()
    .optional()
    .transform((value: unknown) => "true" === value || true === value || false),
});

type Environment = z.infer<typeof environmentSchema>;

@singleton()
export class EnvironmentService {
  private environment: Environment;

  constructor() {
    this.parse();
  }

  get<T extends keyof Environment>(
    key: T
  ): T extends keyof Environment ? Environment[T] : never {
    this.parse();
    return this.environment[key] as any;
  }

  parse() {
    try {
      config({ override: true });
      this.environment = environmentSchema.parse(process.env);
    } catch (error: any) {
      throw error.format();
    }
  }
}
