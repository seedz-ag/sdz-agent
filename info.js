const si = require("systeminformation");

// export interface systeminfoInterface {

//   memory: {
//     total: "total",
//     free: "free",
//     used: "used",
//   },
//   cpu: {
//     manufacturer: "manufacturer",
//     brand: "brand",
//     vendor: "vendor",
//     cores: "cores",
//     physicalCores: "physicalCores",
//     performanceCores: "performanceCores",
//     processors: "processors",
//   },
//   disk: [
//     {
//       fs: string,
//       size: Number,
//       used: Number,
//       available: Number,
//     },
//   ],
//   network: [
//     {
//       ip4: "ip4",
//       ip4subnet: "ip4subnet:",
//       ip6: "ip6",
//       ip6subnet: "ip6subnet",
//       mac: "mac",
//       internal: "internal",
//     },
//   ],
//   osInfo: {
//     platform: "platform",
//     distro: "distro",
//     release: "release",
//     codename: "codename",
//     hostname: "hostname",
//   },
// };

const systeminfo = {
  mem: {
    total: "total",
    free: "free",
    used: "used",
  },
  cpu: {
    manufacturer: "manufacturer",
    brand: "brand",
    vendor: "vendor",
    cores: "cores",
    physicalCores: "physicalCores",
    performanceCores: "performanceCores",
    processors: "processors",
  },
  disk: [
    {
      fs: "fs",
      size: "size",
      used: "used",
      available: "available",
    },
  ],
  network: [
    {
      ip4: "ip4",
      ip4subnet: "ip4subnet:",
      ip6: "ip6",
      ip6subnet: "ip6subnet",
      mac: "mac",
      internal: "internal",
    },
  ],
  osInfo: {
    platform: "platform",
    distro: "distro",
    release: "release",
    codename: "codename",
    hostname: "hostname",
  },
};

si.fsSize()
  .then((data) => {
    data.forEach(({ fs, size, used, available }) => {
      systeminfo.disk.push({ fs, size, used, available });
    });
    console.log(systeminfo);
  })
  .catch((error) => console.error(error));

// si.mem()
//   .then((data) => console.log(data))
//   .catch((error) => console.error(error));

// si.osInfo()
//   .then((data) => console.log(data))
//   .catch((error) => console.error(error));

// si.cpu()
//   .then((data) => console.log(data))
//   .catch((error) => console.error(error));

// si.networkInterfaces()
//   .then((data) => console.log(data))
//   .catch((error) => console.error(error));

si.disksIO()
  .then((data) => console.log(data))
  .catch((error) => console.error(error));
si.blockDevices()
  .then((data) => console.log(data))
  .catch((error) => console.error(error));
