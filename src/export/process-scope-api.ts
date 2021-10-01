export default class {
  private config: any;
  private legacy: boolean;
	private promises: Promise<boolean>[];
  private transport: any;
	constructor(config: any, legacy: boolean) {
    this.config = config;
    this.legacy = legacy;
  }

  getTransport() {
    if (!this.transport) {
      // this.transport = new (this.legacy ? : );
    }
    return this.transport;
  }

	async process(response: any) {
    this.promises.push(
      this.getTransport().send(response.meta.name, response.data)
    );
	}

	async send() {
		await Promise.all(this.promises);
	}
}