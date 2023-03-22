import { IXMLAdapter } from '@/interfaces/xml.interface'
import { XMLParser } from 'fast-xml-parser'

export const XMLAdapter = (): IXMLAdapter =>
  new XMLParser({
    numberParseOptions: {
      leadingZeros: true,
      hex: false,
      eNotation: false
    }
  })
