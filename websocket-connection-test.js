const { io } = require("socket.io-client");
require("dotenv").config();
(async () => {

const socket = io(`${process.env.WS_SERVER_URL}`, {
    path: "/integration/agentws",
    query: {
      token: 'cftfl69KLHguV4xIWs4NUeqTWv6eItgMO5eAEorWeAO',
    },
    upgrade: false,
    timeout: 5000,
    transports: ["websocket"],
    });

    socket.on("connect", () => {
    console.log("Connected to SdzAgentWS");
    console.log(socket.id)

  })

  await socket.connect();
  console.log(1)
  
  await new Promise((resolve) => {
    console.log('pre emit')
    socket.emit("get-http-request", 'teste',(response) => {
    console.log(response)
    resolve()
    })
     
  });

  // socket.emit("save-http-request", 'teste', {
  //   dataPath: 'soap:envelope.soap:body.ns0:mt_fatura.line',
  //   url: 'http://intpaytrack.agrex.com.br:8000/XISOAPAdapter/MessageServlet?senderParty=SINCRONIA&senderService=Implanta_QA&receiverParty=&receiverService=&interface=SAPBrokerWebServiceSoap&interfaceNamespace=http://agrex.com.br/SINCRONIA/Common',
  //   headers: {
  //     Accept: "application/xml",
  //     Authorization: "Basic SU5URUdSQV9RQVM6TW5mZUAyMDEx",
  //     "Content-Type": "application/xml",
  //     SOAPAction: "http://sap.com/xi/WebService/soap1.1",
  //   },
  //   body:  `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:fat="http://agrex.com.br/SINCRONIA/FaturamentoBruto">
  //   <soapenv:Header/>
  //   <soapenv:Body>
  //     <fat:sendBilling>
  //       <data_ini>20220401</data_ini>
  //       <data_fim>20220401</data_fim>
  //       <codi_rev>{codi_rev}</codi_rev>
  //     </fat:sendBilling>
  //   </soapenv:Body>
  // </soapenv:Envelope>` ,
  //   scope: {
  //     codi_rev: 'teste',
  //   },
  //   method: 'POST'

  // } ,console.log)

})();

