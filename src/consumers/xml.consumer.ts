import { IXMLAdapter } from '@/interfaces/xml.interface'

export const XMLConsumer = ({ XML }: { XML: IXMLAdapter }) => (xml: string): any => XML.parse(xml)
