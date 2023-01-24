import { XMLParser } from "fast-xml-parser";
const parser = new XMLParser({
  numberParseOptions: {
    leadingZeros: true,
    hex: false,
    eNotation: false,
  }
});

export const parse = (xml: string) => {
  return parser.parse(xml);
}