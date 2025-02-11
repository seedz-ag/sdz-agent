export interface ISystemInfo {
  memory: {
    total: number,
    free: number,
    used: number,
  },
  cpu: {
    manufacturer: string,
    brand: string,
    vendor: string,
    cores: number,
    physicalCores: number,
    performanceCores: number | undefined,
    processors: number,
  },
  disk:
  {
    fs: string,
    size: number,
    used: number,
    available: number,
  }[],
  network:
  {
    ip4: string,
    ip4subnet: string,
    ip6: string,
    ip6subnet: string,
    mac: string,
    internal: boolean,
  }[],

  osInfo: {
    platform: string,
    distro: string,
    release: string,
    codename: string,
    hostname: string,
  },
};
