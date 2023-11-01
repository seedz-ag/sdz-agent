export interface IDiscoveryBody {
  API_URL: string;
  CREDENTIALS: {
    CLIENT_ID: string;
    CLIENT_SECRET: string;
  };
}

export interface IDiscovery {
  DEV?: IDiscoveryBody;
  HML?: IDiscoveryBody;
  SND?: IDiscoveryBody;
  PRD?: IDiscoveryBody;
}
