import { ls, readFile, rename } from "../utils/consumers/s3";

import { Hydrator } from "sdz-agent-common";
import { auth } from "../utils/auth/cognito";
import axios from 'axios'
import dotenv from 'dotenv'
import { get } from 'dot-wild';
import { parse } from "../utils/consumers/xml";

dotenv.config();

const filterValidSettings = (Settings: any[]) => Settings.filter((setting: any) => setting.Queries.filter((query: any) => !!query.Path).length);

const getSettings = () => axios.get(`${process.env.SDZ_MS_SETTINGS}settings`);

const hydrateItem = (xml: any, row: any, Schema: any) => Schema.Maps.reduce((acc: Record<string, any>, Map: any) => {
  const [Data, From] = Map.From.startsWith("/") ? [xml, Map.From.substring(1)] : [row, Map.From];
  const Tmp: any = Hydrator({[Map.To]: From}, Data);
  return {
    ...acc,
    ...Object.keys(Tmp).reduce((carr: any, curr: string) => {
      carr[curr] = `${Tmp[curr]}`;
      return carr;
    }, {})
  };
}, {});

const post = (Authorization: string, ApiResource: string, Payload: any[]) => axios({
    headers: { Authorization },
    data: Payload,
    method: 'POST',
    url: `${process.env.SDZ_SAGA}${ApiResource}`
});


const searchXMLFiles = (Contents: any) => Contents.filter((Content: any) => {
  const Filename = Content.Key.split("/").pop();
  return !!Content.Size && Filename.endsWith('.xml') && !Filename.startsWith('*');
});

const searchSchemaByEntity = (Schemas: any[], Entity: any) => Schemas.find((Schema: any) => Schema.Entity === Entity);

(async () => {
  const { data } = await getSettings();

  const Settings = filterValidSettings(data);

  for (const Setting of Settings) {
    try {
      const Authorization = await auth(Setting.Client);

      for (const { Command, Entity, Path } of Setting.Queries) {
        const Bucket = Path.split("/").shift();

        const { Contents } = await ls(Path);

        if (!Contents) {
          continue;
        }

        const Files = searchXMLFiles(Contents);

        for (const { Key } of Files) {
          const { Body } = (await readFile(`${Bucket}/${Key}`));

          if (!Body) {
            continue;
          }

          const Schema = searchSchemaByEntity(Setting.Schemas, Entity)

          if (!Schema) {
            continue;
          }

          const xml = parse(Body.toString());

          const rows = get(xml, Command || "*");

          if (!rows.length) {
            continue;
          }

          const payload: any[] = rows.map((row: any) => hydrateItem(xml, row, Schema));

          const response = await post(Authorization, Schema.ApiResource, payload);

          console.log(response.data);

          await rename(Bucket, Key);
        }
      }
    } catch (err: any) {
      console.error(err);
      continue;
    }
  }
})();
