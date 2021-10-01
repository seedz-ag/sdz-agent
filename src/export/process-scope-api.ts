export default class {
  private config: any;
	private promises: Promise<boolean>[];
  private transport: any;
	constructor(config: any) {
    this.config = config;
  }

  getTransport() {
    if (!this.transport) {
      // this.transport = new ;
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