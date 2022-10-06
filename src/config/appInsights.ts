// import * as appInsights from "applicationinsights";

// export default {
//   init: async () => {
//     appInsights
//       .setup(process.env.APPLICATION_INSIGHTS_CONNECTION_STRING)
//       .setAutoDependencyCorrelation(true)
//       .setAutoCollectRequests(true)
//       .setAutoCollectPerformance(true, true)
//       .setAutoCollectExceptions(true)
//       .setAutoCollectDependencies(true)
//       .setInternalLogging(true)
//       .setAutoCollectConsole(true)
//       .setUseDiskRetryCaching(true)
//       .setSendLiveMetrics(true)
//       .setAutoDependencyCorrelation(true)
//       .setDistributedTracingMode(appInsights.DistributedTracingModes.AI);

//     const client = appInsights.defaultClient;

//     client.context.tags[appInsights.defaultClient.context.keys.cloudRole] =
//       process.env.APPLICATION_INSIGHTS_TAG_NAME as string;

//     client.commonProperties = {
//       clientId: `${process.env.CLIENT_ID}`,
//     };

//     appInsights.start();
//   },
// };
