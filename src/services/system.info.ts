import { singleton } from "tsyringe";
import si from "systeminformation";
import { ISystemInfo } from "interfaces/system-info.interface";
import { LoggerAdapter } from "adapters/logger.adapter";

@singleton()
export class SystemInfoService {
  constructor(
    private readonly loggerAdapter: LoggerAdapter,
  ) { }
  async getSystemInfo() {
    const [cpu, disk, memory, network, osInfo] = await Promise.all([
      this.getCpu(),
      this.getDiskInfo(),
      this.getMemory(),
      this.getNetwork(),
      this.getOs(),
    ])
    const systemInfo: ISystemInfo = {
      cpu,
      disk,
      memory,
      network,
      osInfo
    };

    return systemInfo;
  }

  async getCpu(): Promise<ISystemInfo["cpu"]> {
    return si.cpu()
      .then(({
        manufacturer,
        brand,
        vendor,
        cores,
        physicalCores,
        performanceCores,
        processors
      }) => ({
        manufacturer,
        brand,
        vendor,
        cores,
        physicalCores,
        performanceCores,
        processors
      }))
      .catch((error) => {
        console.log(error)
        this.loggerAdapter.log("error", `SYSTEMINFO GET CPU`);
        return {} as ISystemInfo["cpu"]
      });
  }

  async getDiskInfo(): Promise<ISystemInfo["disk"]> {
    return si.fsSize()
      .then((data) => {
        return data.map(({ fs, size, used, available }) => {
          return { fs, size, used, available };
        });
      })
      .catch((error) => {
        console.log(error)
        this.loggerAdapter.log("error", `SYSTEMINFO GET DISK INFO`);
        return []
      })
  }

  async getMemory(): Promise<ISystemInfo["memory"]> {
    return si.mem()
      .then(({ total, free, used }) => ({ total, free, used }))
      .catch((error) => {
        console.log(error)
        this.loggerAdapter.log("error", `SYSTEMINFO GET MEMORY`);
        return {} as ISystemInfo["memory"]
      });
  }

  async getNetwork(): Promise<ISystemInfo["network"]> {
    return si.networkInterfaces()
      .then((data) => {
        if (Array.isArray((data))) {
          return data.map(({
            ip4,
            ip4subnet,
            ip6,
            ip6subnet,
            mac,
            internal
          }) => {
            return { ip4, ip4subnet, ip6, ip6subnet, mac, internal };
          });
        }
        else {
          return [{
            ip4: data.ip4,
            ip4subnet: data.ip4subnet,
            ip6: data.ip6,
            ip6subnet: data.ip6subnet,
            mac: data.mac,
            internal: data.internal
          }]
        }
      })
      .catch((error) => {
        console.log(error)
        this.loggerAdapter.log("error", `SYSTEMINFO GET NETWORK`);
        return [];
      })
  }

  async getOs(): Promise<ISystemInfo["osInfo"]> {
    return si.osInfo()
      .then(({ platform,
        distro,
        release,
        codename,
        hostname }) => ({
          platform,
          distro,
          release,
          codename,
          hostname
        }))
      .catch((error) => {
        console.log(error)
        this.loggerAdapter.log("error", `SYSTEMINFO GET OS`);
        return {} as ISystemInfo["osInfo"]
      });
  }
}