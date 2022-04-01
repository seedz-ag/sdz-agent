import { OpenIdClient } from './auth';
require("dotenv").config();

export default new OpenIdClient(`${process.env.ISSUER_URL}`, `${process.env.CLIENT_ID}`, `${process.env.CLIENT_SECRET}`);