import { config } from "dotenv";
import { IDiscovery } from "interfaces/discovery.interface";
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
  AMAZON_ACCESS_KEY: z.string().optional(),
  AMAZON_ACCESS_SECRET_KEY: z.string().optional(),
  AMAZON_REGION: z.string().optional(),
  AMAZON_S3_RAW_BUCKET: z.string().optional(),
  CHUNK_SIZE: z
    .string()
    .optional()
    .transform((value: unknown) => Number(value) || 500),
  ENV: z.enum(["DEV", "SND", "PRD"]).optional(),
  EXTRACT_LAST_N_DAYS: z
    .string()
    .optional()
    .transform((value: unknown) => Number(value) || 0),
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
    .default("2000")
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
  private discovery: IDiscovery;
  private environment: Environment;

  constructor() {
    this.parse();
  }

  setDiscovery(discovery: IDiscovery) {
    this.discovery = discovery;
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

      this.environment = environmentSchema.parse({
        ...process.env,
        ...((this.environment?.ENV &&
          this.discovery && {
          API_URL: this.discovery[this.environment.ENV]?.API_URL,
          CLIENT_ID:
            this.discovery[this.environment.ENV]?.CREDENTIALS.CLIENT_ID,
          CLIENT_SECRET:
            this.discovery[this.environment.ENV]?.CREDENTIALS.CLIENT_SECRET,
        }) ||
          {}),
      });
    } catch (error: any) {
      throw error.format();
    }
  }
}
