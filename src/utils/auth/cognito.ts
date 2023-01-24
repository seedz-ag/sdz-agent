import axios from "axios";
import qs from "qs";

export const auth = async (Client: { ClientId: string, ClientSecret: string }) => {
  const { data: { access_token: Token } } = await axios({
    data: qs.stringify({
      client_id: Client.ClientId,
      client_secret: Client.ClientSecret,
      grant_type: 'client_credentials'
    }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: 'post',
    url: `${process.env.SDZ_AUTH}`,
  });
  return Token;
}