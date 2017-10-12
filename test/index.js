//  Unit Test
/* global describe:true, it:true, beforeEach:true */
/* eslint-disable import/no-extraneous-dependencies, no-console, no-unused-vars, one-var,
 no-underscore-dangle */
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const common = require('sigfox-gcloud');
const ubidots = require('ubidots');
const moduleTested = require('../index');  //  Module to be tested, i.e. the parent module.

const moduleName = 'sendToUbidots';
const should = chai.should();
chai.use(chaiAsPromised);
let req = {};
let testDevicesByClient1 = null;
let testDevicesByClient2 = null;
let testDevicesByAllClients = null;

/* eslint-disable quotes, max-len */
//  Test data: Send sensor data to these 2 device IDs from 2 different Ubidots accounts.
//  Assume that 'Sigfox Device 2C30EA' and 'Sigfox Device 2C30EB' have been created
//  in the first and second accounts respectively.
const testDevice1 = '2C30EA';
const testDevice2 = '2C30EB';
const testVariable = 'tmp';
const testValue = 28.2205;

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

  it('should load Ubidots devices', () => {
    //  Load all devices from the first Ubidots account.  Confirm that it includes
    //  the first test device ID.
    const testDevice = testDevice1;
    const key = moduleTested.allKeys[0];
    const client = ubidots.createClient(key);
    common.log(req, 'unittest', { testDevice, key });
    const promise = moduleTested.loadDevicesByClient(req, client)
      .then((result) => {
        common.log(req, 'unittest', { result });
        //  Save the map of devices.
        testDevicesByClient1 = result;
        return result;
      })
      .catch((error) => {
        common.error(req, 'unittest', { error });
        throw error;
      })
    ;
    return Promise.all([
      promise,
      //  The map of devices should include the test device.
      promise.should.eventually.have.property(testDevice),
    ]);
  });

  it('should load devices from second Ubidots account', () => {
    //  Load all devices from the second Ubidots account.  Confirm that it includes
    //  the second test device ID.
    const testDevice = testDevice2;
    const key = moduleTested.allKeys[1];
    const client = ubidots.createClient(key);
    common.log(req, 'unittest', { testDevice, key });
    const promise = moduleTested.loadDevicesByClient(req, client)
      .then((result) => {
        common.log(req, 'unittest', { result });
        //  Save the map of devices.
        testDevicesByClient2 = result;
        return result;
      })
      .catch((error) => {
        common.error(req, 'unittest', { error });
        throw error;
      })
    ;
    return Promise.all([
      promise,
      //  The map of devices should include the test device.
      promise.should.eventually.have.property(testDevice),
    ]);
  });

  it('should merge devices from two Ubidots account', () => {
    //  Merge the devices from the two Ubidots account.  Confirm that it includes
    //  the first and second test device IDs.
    const devicesArray = [testDevicesByClient1, testDevicesByClient2];
    common.log(req, 'unittest', { devicesArray, testDevice1, testDevice2 });
    const result = moduleTested.mergeDevices(req, devicesArray);
    common.log(req, 'unittest', { result });
    //  Save the map of devices.
    testDevicesByAllClients = result;
    const promise = Promise.resolve(result);
    return Promise.all([
      promise,
      //  The map of devices should include the 2 test devices.
      promise.should.eventually.have.property(testDevice1),
      promise.should.eventually.have.property(testDevice2),
    ]);
  });

  it('should load Ubidots variables', () => {
    //  Load variables from the first test device.  Confirm that it includes
    //  the test variable.
    const testDevice = testDevice1;
    common.log(req, 'unittest', { testDevice });
    const promise = moduleTested.getVariablesByDevice(req, testDevicesByAllClients, testDevice)
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
      //  The loaded variables should include the test variable.
      promise.should.eventually.have.deep.property(`[0].${testVariable}`),
    ]);
  });

  it('should update Ubidots variable', () => {
    //  Update a variable from the first test device.
    const testDevice = testDevice1;
    const clientDevices = testDevicesByAllClients[testDevice];
    const allValues = {};
    allValues[testVariable] = { value: testValue };
    common.log(req, 'unittest', { clientDevices, allValues });
    const promise = moduleTested.setVariables(req, clientDevices[0], allValues)
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

  it('should record Sigfox message in Ubidots', () => {
    //  Sending a Sigfox message to Ubidots should update the sensor values
    //  in Ubidots.  Check manually that the sensor values were updated.
    const testDevice = testDevice1;
    const msg = getTestMessage('number', testDevice);
    const body = msg.body;
    common.log(req, 'unittest', { testDevice, body, msg });
    const promise = moduleTested.task(req, testDevice, body, msg)
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

  it('should record Sigfox message in second Ubidots account', () => {
    //  Sending a Sigfox message to Ubidots with the second device ID
    //  should update the sensor values in the second account for Ubidots.
    //  Check manually that the sensor values were updated.
    const testDevice = testDevice2;
    const msg = getTestMessage('number', testDevice);
    const body = msg.body;
    common.log(req, 'unittest', { testDevice, body, msg });
    const promise = moduleTested.task(req, testDevice, body, msg)
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

/* eslint-disable max-len */
/* Sample PubSub message
const testEvent = {
  eventType: "providers/cloud.pubsub/eventTypes/topic.publish",
  resource: `projects/myproject/topics/sigfox.types.${moduleName}`,
  timestamp: "2017-05-07T14:30:53.014Z",
  data: {
    attributes: {
    },
    type: "type.googleapis.com/google.pubsub.v1.PubsubMessage",
    data: "eyJkZXZpY2UiOiIxQzhBN0UiLCJ0eXBlIjoiZGVjb2RlU3RydWN0dXJlZE1lc3NhZ2UiLCJib2R5Ijp7InV1aWQiOiJhYjBkNDBiZC1kYmM1LTQwNzYtYjY4NC0zZjYxMGQ5NmU2MjEiLCJkYXRldGltZSI6IjIwMTctMDUtMDcgMTQ6MzA6NTEiLCJjYWxsYmFja1RpbWVzdGFtcCI6MTQ5NDE2NzQ1MTI0MCwiZGV2aWNlIjoiMUM4QTdFIiwiZGF0YSI6IjkyMGUwNjI3MjczMTc0MWRiMDUxZTYwMCIsImR1cGxpY2F0ZSI6ZmFsc2UsInNuciI6MTguODYsInN0YXRpb24iOiIwMDAwIiwiYXZnU25yIjoxNS41NCwibGF0IjoxLCJsbmciOjEwNCwicnNzaSI6LTEyMywic2VxTnVtYmVyIjoxNDkyLCJhY2siOmZhbHNlLCJsb25nUG9sbGluZyI6ZmFsc2UsInRpbWVzdGFtcCI6IjE0NzY5ODA0MjYwMDAiLCJiYXNlU3RhdGlvblRpbWUiOjE0NzY5ODA0MjYsInNlcU51bWJlckNoZWNrIjpudWxsfSwicXVlcnkiOnsidHlwZSI6ImFsdGl0dWRlIn0sImhpc3RvcnkiOlt7InRpbWVzdGFtcCI6MTQ5NDE2NzQ1MTI0MCwiZW5kIjoxNDk0MTY3NDUxMjQyLCJkdXJhdGlvbiI6MCwibGF0ZW5jeSI6bnVsbCwic291cmNlIjpudWxsLCJmdW5jdGlvbiI6InNpZ2ZveENhbGxiYWNrIn0seyJ0aW1lc3RhbXAiOjE0OTQxNjc0NTI0NTQsImVuZCI6MTQ5NDE2NzQ1MjgzMywiZHVyYXRpb24iOjAuMywibGF0ZW5jeSI6MS4yLCJzb3VyY2UiOiJwcm9qZWN0cy91bmF0dW1ibGVyL3RvcGljcy9zaWdmb3guZGV2aWNlcy5hbGwiLCJmdW5jdGlvbiI6InJvdXRlTWVzc2FnZSJ9XSwicm91dGUiOlsibG9nVG9Hb29nbGVTaGVldHMiXX0=",
  },
  eventId: "121025758478243",
};
*/
