require("appdynamics").profile({
  controllerHostName: "<controller host name>",
  controllerPort: "<controller port number>",
  controllerSslEnabled: false, // Set to true if controllerPort is SSL
  accountName: "<AppDynamics_account_name>",
  accountAccessKey: "<AppDynamics_account_key>", //required
  applicationName: "your_app_name",
  tierName: "choose_a_tier_name",
  nodeName: "choose_a_node_name",
});
