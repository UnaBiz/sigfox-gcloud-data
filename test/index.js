//  Unit Test
/* global describe:true, it:true, beforeEach:true */
/* eslint-disable import/no-extraneous-dependencies, no-console, no-unused-vars, one-var,
 no-underscore-dangle */
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const common = require('sigfox-gcloud');
const moduleTested = require('../index');  //  Module to be tested, i.e. the parent module.

const moduleName = 'sendToDatabase';
const should = chai.should();
chai.use(chaiAsPromised);
let req = {};

/* eslint-disable quotes, max-len */
//  Test data: Send sensor data to these 2 device IDs from 2 different Ubidots accounts.
//  Assume that 'Sigfox Device 2C30EA' and 'Sigfox Device 2C30EB' have been created
//  in the first and second accounts respectively.
const testDevice1 = '2C30EA';

const testData = {  //  Structured msgs with numbers and text fields.
  number: '920e06272731741db051e600',
  text: '8013e569a0138c15c013f929',
};
const testBody = (timestamp, device, data) => ({
  deviceLat: 1.303224739957452,
  deviceLng: 103.86088826178306,
  data,
  ctr: 123,
  lig: 456,
  tmp: 36.9,
  longPolling: false,
  device,
  ack: false,
  station: "0000",
  avgSnr: 15.54,
  timestamp: `${timestamp}`,
  seqNumber: 1492,
  lat: 1,
  callbackTimestamp: timestamp,
  lng: 104,
  duplicate: false,
  datetime: "2017-05-07 14:30:51",
  baseStationTime: parseInt(timestamp / 1000, 10),
  snr: 18.86,
  seqNumberCheck: null,
  rssi: -123,
  uuid: "ab0d40bd-dbc5-4076-b684-3f610d96e621",
});
const testMessage = (timestamp, device, data) => ({
  history: [
    {
      duration: 0,
      end: timestamp,
      timestamp,
      function: "sigfoxCallback",
      latency: null,
    },
  ],
  query: {
    type: moduleName,
  },
  route: [],
  device,
  body: testBody(timestamp, device, data),
  type: moduleName,
});
/* eslint-enable quotes, max-len */

function startDebug() {
  //  Stub for setting breakpoints on exception.
}

function getTestMessage(type, device) {
  //  Return a copy of the test message with timestamp updated.
  const timestamp = Date.now();
  return testMessage(timestamp, device, testData[type]);
}

describe(moduleName, () => {
  //  Test every exposed function in the module.

  beforeEach(() => {
    //  Erase the request object before every test.
    startDebug();
    req = { unittest: true };
  });

  it('should create sensor table', () => {
    //  Create the sensor table if it doesn't exist.
    const testDevice = testDevice1;
    common.log(req, 'unittest', { testDevice });
    const promise = moduleTested.createTable(req)
      .then((result) => {
        common.log(req, 'unittest', { result });
        return result;
      })
      .catch((error) => {
        common.error(req, 'unittest', { error });
        throw error;
      })
    ;
    return Promise.all([
      promise,
    ]);
  });
});
