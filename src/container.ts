import "reflect-metadata";
import { Lifecycle, container } from "tsyringe";
import { CSVAdapter } from "./adapters/csv.adapter";
import { FTPAdapter } from "./adapters/ftp.adapter";
import { HttpClientAdapter } from "./adapters/http-client.adapter";
import { LoggerAdapter } from "./adapters/logger.adapter";
import { CheckCommand } from "./commands/check.command";
import { ConfigureCommand } from "./commands/configure.command";
import { ExecuteCommand } from "./commands/execute.command";
import { ListenExecuteCommand } from "./commands/listen-execute.command";
import { ListenResponseCommand } from "./commands/listen-response.command";
import { ListenShellCommand } from "./commands/listen-shell.command";
import { ListenCommand } from "./commands/listen.command";
import { DatabaseConsumer } from "./consumers/database.consumer";
import { HttpConsumer } from "./consumers/http.consumer";
import { APIService } from "./services/api.service";
import { ArgsService } from "./services/args.service";
import { ConsumerResolverService } from "./services/consumer-resolver.service";
import { EnvironmentService } from "./services/environment.service";
import { HydratorService } from "./services/hydrator.service";
import { InterpolationService } from "./services/interpolation.service";
import { UtilsService } from "./services/utils.service";
import { VPNService } from "./services/vpn.service";

export const getContainer = async () => {
  // ADAPTERS
  container.register(
    CSVAdapter,
    { useClass: CSVAdapter },
    {
      lifecycle: Lifecycle.Singleton,
    }
  );
  container.register(
    FTPAdapter,
    { useClass: FTPAdapter },
    {
      lifecycle: Lifecycle.Singleton,
    }
  );
  container.register(
    HttpClientAdapter,
    { useClass: HttpClientAdapter },
    {
      lifecycle: Lifecycle.Singleton,
    }
  );
  container.register(
    LoggerAdapter,
    { useClass: LoggerAdapter },
    { lifecycle: Lifecycle.Singleton }
  );

  // COMMANDS
  container.register(
    CheckCommand,
    { useClass: CheckCommand },
    { lifecycle: Lifecycle.Singleton }
  );
  container.register(
    ConfigureCommand,
    { useClass: ConfigureCommand },
    { lifecycle: Lifecycle.Singleton }
  );
  container.register(
    ExecuteCommand,
    { useClass: ExecuteCommand },
    { lifecycle: Lifecycle.Singleton }
  );
  container.register(
    ListenExecuteCommand,
    { useClass: ListenExecuteCommand },
    { lifecycle: Lifecycle.Singleton }
  );
  container.register(
    ListenResponseCommand,
    {
      useClass: ListenResponseCommand,
    },
    { lifecycle: Lifecycle.Singleton }
  );
  container.register(
    ListenShellCommand,
    { useClass: ListenShellCommand },
    { lifecycle: Lifecycle.Singleton }
  );
  container.register(
    ListenCommand,
    { useClass: ListenCommand },
    { lifecycle: Lifecycle.Singleton }
  );

  // CONSUMERS
  container.register(
    DatabaseConsumer,
    { useClass: DatabaseConsumer },
    { lifecycle: Lifecycle.Singleton }
  );
  container.register(
    HttpConsumer,
    { useClass: HttpConsumer },
    { lifecycle: Lifecycle.Singleton }
  );

  // SERVICES
  container.register(
    APIService,
    { useClass: APIService },
    { lifecycle: Lifecycle.Singleton }
  );
  container.register(
    ArgsService,
    { useClass: ArgsService },
    { lifecycle: Lifecycle.Singleton }
  );
  container.register(
    ConsumerResolverService,
    {
      useClass: ConsumerResolverService,
    },
    { lifecycle: Lifecycle.Singleton }
  );
  container.register(
    EnvironmentService,
    { useClass: EnvironmentService },
    { lifecycle: Lifecycle.Singleton }
  );
  container.register(
    HydratorService,
    { useClass: HydratorService },
    { lifecycle: Lifecycle.Singleton }
  );
  container.register(
    InterpolationService,
    { useClass: InterpolationService },
    { lifecycle: Lifecycle.Singleton }
  );
  container.register(
    UtilsService,
    { useClass: UtilsService },
    { lifecycle: Lifecycle.Singleton }
  );
  container.register(
    VPNService,
    { useClass: VPNService },
    { lifecycle: Lifecycle.Singleton }
  );

  return container;
};
