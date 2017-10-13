//  Google Cloud Function sendToUbidots is triggered when a
//  Sigfox message is sent to the PubSub message queue
//  sigfox.types.sendToUbidots.
//  We call the Ubidots API to send the Sigfox message to Ubidots.

//  //////////////////////////////////////////////////////////////////////////////////////////
//  Begin Common Declarations

/* eslint-disable camelcase, no-console, no-nested-ternary, import/no-dynamic-require,
 import/newline-after-import, import/no-unresolved, global-require, max-len */
//  Enable DNS cache in case we hit the DNS quota for Google Cloud Functions.
require('dnscache')({ enable: true });
process.on('uncaughtException', err => console.error(err.message, err.stack));  //  Display uncaught exceptions.
if (process.env.FUNCTION_NAME) {
  //  Load the Google Cloud Trace and Debug Agents before any require().
  //  Only works in Cloud Function.
  require('@google-cloud/trace-agent').start();
  require('@google-cloud/debug-agent').start();
}
//  We use Feathers and the KNEX library to support many types of databases.
//  Remember to install any needed database clients e.g. "mysql", "pg"
const knex = require('knex');
let db = null;  //  Instance of the KNEX library.

//  End Common Declarations
//  //////////////////////////////////////////////////////////////////////////////////////////

//  //////////////////////////////////////////////////////////////////////////////////////////
//  Begin Message Processing Code

//  Our database settings are stored in the Google Cloud Metadata store under this prefix.
const metadataPrefix = 'sigfox-db';
const metadataKeys = {   //  Keys we use and their default values, before prepending metadataPrefix.
  client: null,          //  Database client to be used e.g mysql. Must be installed from npm.
  host: null,            //  Address of database server e.g. 127.0.0.1
  user: 'user',          //  User ID for accessing the database e.g. user
  password: null,        //  Password for accessing the database.
  name: 'sigfox',        //  Name of the database, e.g. sigfox
  table: 'sensordata',   //  Name of the table to store sensor data e.g. sensordata
  version: null,         //  Version number of database, used only by Postgres e.g. 7.2
  id: 'uuid',            //  Name of the ID field in the table e.g. uuid
};

//  Default fields to be created in sensordata table. Format: fieldname, indexed?, comment
const sensorfields = (tbl) => ({
  uuid: [tbl.uuid, false, 'Primary key: Unique message ID in UUID format, e.g. 4cf3ad36-3d3e-415c-a25b-9f8ab2bb4466'],
  timestamp: [tbl.timestamp, true, 'Timestamp of message receipt at basestation., e.g. 1507798768000'],

  alt: [tbl.float, false, 'Altitude in metres above sea level, used by send-alt-structured demo, e.g. 86.4'],
  avgSnr: [tbl.float, false, 'Sigfox average signal-to-noise ratio, e.g. 59.84'],
  baseStationLat: [tbl.float, false, 'Sigfox basestation latitude.  Usually truncated to 0 decimal points, e.g. 1'],
  baseStationLng: [tbl.float, false, 'Sigfox basestation longitude.  Usually truncated to 0 decimal points, e.g. 104'],
  baseStationTime: [tbl.integer, false, 'Sigfox timestamp of message receipt at basestation, in seconds since epoch (1/1/1970), e.g. 1507798768'],
  callbackTimestamp: [tbl.integer, false, 'Timestamp at which sigfoxCallback was called, e.g. 1507798769710'],
  data: [tbl.string, false, 'Sigfox message data, e.g. b0510001a421f90194056003'],
  datetime: [tbl.string, false, 'Human-readable datetime, e.g. 2017-10-12 08:59:29'],
  device: [tbl.string, true, 'Sigfox device ID, e.g. 2C1C85'],
  deviceLat: [tbl.float, false, 'Latitude of GPS tracker e.g. UnaTumbler.'],
  deviceLng: [tbl.float, false, 'Longitude of GPS tracker e.g. UnaTumbler.'],
  duplicate: [tbl.boolean, true, 'Sigfox sets to false if this is the first message received among all basestations.'],
  geolocLat: [tbl.float, false, 'Sigfox Geolocation latitude of device.'],
  geolocLng: [tbl.float, false, 'Sigfox Geolocation longitude of device.'],
  geolocLocationAccuracy: [tbl.float, false, 'Sigfox Geolocation accuracy of device.'],
  hmd: [tbl.float, false, '% Humidity, used by send-alt-structured demo, e.g. 50.5'],
  lat: [tbl.float, false, 'Latitude for rendering in Ubidots.'],
  lng: [tbl.float, false, 'Longitude for rendering in Ubidots.'],
  rssi: [tbl.float, true, 'Sigfox signal strength, e.g. -122'],
  seqNumber: [tbl.integer, true, 'Sigfox message sequence number, e.g. 2426'],
  snr: [tbl.float, false, 'Sigfox message signal-to-noise ratio, e.g. 21.61'],
  station: [tbl.string, true, 'Sigfox basestation ID, e.g. 2464'],
  tmp: [tbl.float, false, 'Temperature in degrees Celsius, used by send-alt-structured demo, e.g. 25.6'],
});

//  Name of Feathers service.
const serviceName = 'sensorrecorder';

function wrap() {
  //  Wrap the module into a function so that all Google Cloud resources are properly disposed.
  const sgcloud = require('sigfox-gcloud'); //  sigfox-gcloud Framework
  const googlemetadata = require('sigfox-gcloud/lib/google-metadata');  //  For accessing Google Metadata.
  const feathers = require('feathers');
  const service = require('feathers-knex');
  const errorHandler = require('feathers-errors/handler');

  let getMetadataConfigPromise = null;  //  Promise for returning the config.

  function getMetadataConfig(req, metadataPrefix0, metadataKeys0) {
    //  Fetch the metadata config from the Google Cloud Metadata store.  metadataPrefix is the common
    //  prefix for all config keys, e.g. "sigfox-db".  metadataKeys is a map of the key suffix
    //  and the default values.  Returns a promise for the map of metadataKeys to values.
    //  We use the Google Cloud Metadata store because it has an editing screen and is easier
    //  to deploy, compared to a config file.
    if (getMetadataConfigPromise) return getMetadataConfigPromise;  //  Return the cache.
    sgcloud.log(req, 'getMetadataConfig', { metadataPrefix0, metadataKeys0 });
    let authClient = null;
    let metadata = null;
    //  Get a Google auth client.
    getMetadataConfigPromise = googlemetadata.authorize(req)
      .then((res) => { authClient = res; })
      //  Get the project metadata.
      .then(() => googlemetadata.getProjectMetadata(req, authClient))
      //  Convert the metadata to a JavaScript object.
      .then(res => googlemetadata.convertMetadata(req, res))
      .then((res) => { metadata = res; })
      .then(() => {
        //  Hunt for the metadata keys in the metadata object and copy them.
        const config = Object.assign({}, metadataKeys0);
        for (const configKey of Object.keys(config)) {
          const metadataKey = metadataPrefix0 + configKey;
          if (metadata[metadataKey] !== null && metadata[metadataKey] !== undefined) {
            //  Copy the non-null values.
            config[configKey] = metadata[metadataKey];
          }
        }
        const result = config;
        sgcloud.log(req, 'getMetadataConfig', { result, metadataPrefix0, metadataKeys0 });
        return result;
      })
      .catch((error) => {
        sgcloud.log(req, 'getMetadataConfig', { error, metadataPrefix0, metadataKeys0 });
        throw error;
      });
    return getMetadataConfigPromise;
  }

  function getDatabaseConfig(req) {
    //  Return the database connection config from the Google Cloud Metadata store.
    return getMetadataConfig(req, metadataPrefix, metadataKeys)
      .then((metadata) => {
        const dbconfig = {
          client: metadata.client,  //  e.g. 'pg'
          connection: {
            host: metadata.host,
            user: metadata.user,
            password: metadata.password,
            database: metadata.name,
          },
        };
        //  Set the version for Postgres.
        if (metadata.version) dbconfig.version = metadata.version;
        //  Create the KNEX instance for accessing the database.
        db = knex(dbconfig);
        return dbconfig;
      })
      .catch((error) => {
        sgcloud.log(req, 'getDatabaseConfig', { error });
        throw error;
      });
  }

  function throwError(err) {
    throw err;
  }

  function createTable(req) {
    //  Create the sensordata table if it doesn't exist.
    //  Returns a promise.
    let table = null;
    let id = null;
    let metadata = null;
    return Promise.all([
      getDatabaseConfig(req).catch(throwError),
      getMetadataConfig(req).then((res) => { metadata = res; }).catch(throwError),
    ])
      .then(() => {
        table = metadata.table;
        id = metadata.id;
        sgcloud.log(req, 'createTable', { table, id });
        return db.schema.createTable(table, (tbl) => {
          //  Create each field found in sensorfields.
          const fields = sensorfields(tbl);
          for (const fieldName of Object.keys(fields)) {
            const field = fields[fieldName];
            const fieldTypeFunc = field[0];
            const fieldIndex = field[1];
            const fieldComment = field[2];
            if (!fieldTypeFunc) {
              const error = new Error(`Unknown field type for ${fieldName}`);
              sgcloud.error(req, 'createTable', { error });
              continue;
            }
            //  Invoke the column builder function.
            const col = fieldTypeFunc.bind(tbl)(fieldName);
            col.comment(fieldComment);
            //  If id field, set as primary field.
            if (fieldName === id) col.primary();
            if (fieldIndex) col.index();
          }
          //  Add the created_at and updated_at fields.
          tbl.timestamps(true, true);
        });
      })
      .catch((error) => {
        sgcloud.log(req, 'createTable', { error, table, id });
        throw error;
      });
  }

  //  Feathers service for accessing the database.
  let servicePromise = null;

  function createService(req) {
    //  Create the Feathers service that will provide database access.
    //  Returns a promise.
    if (servicePromise) return servicePromise;
    let metadata = null;
    servicePromise = Promise.all([
      getDatabaseConfig(req).catch(throwError),
      getMetadataConfig(req).then((res) => { metadata = res; }).catch(throwError),
    ])
      .then(() => {
        const Model = db;
        const name = metadata.table;
        const id = metadata.id;
        const events = null;
        const paginate = null;
        sgcloud.log(req, 'createService', { serviceName, name, id });
        const app = feathers()
          .use(`/${serviceName}`, service({ Model, name, id, events, paginate }))
          .use(errorHandler());
        return app;
      })
      .catch((error) => {
        sgcloud.log(req, 'createService', { error });
        throw error;
      });
    return servicePromise;
  }

  function task(req, device, body, msg) {
    //  Handle the Sigfox received by adding it to the sensordata table.
    //  Database connection settings are read from Google Compute Metadata.
    //  If the sensordata table is missing, it will be created.
    let app = null;
    //  Create the Feathers service or return from cache.
    return createService(req)
      .then((res) => { app = res; })  // eslint-disable-next-line arrow-body-style
      .then(() => {
        //  Create the record through Feathers and KNEX.
        return app.service(serviceName).create({
          uuid: '4cf3ad36-3d3e-415c-a25b-9f8ab2bb4466',
          station: '0000',
        });
      })
      .then(result => sgcloud.log(req, 'task', { result, serviceName }))
      //  Return the message for the next processing step.
      .then(() => msg)
      .catch((error) => { sgcloud.log(req, 'task', { error, device, body, msg }); throw error; });
  }

  return {
    //  Expose these functions outside of the wrapper.
    //  When this Google Cloud Function is triggered, we call main() which calls task().
    serveQueue: event => sgcloud.main(event, task),

    //  For unit test only.
    task,
    createTable,
    getMetadataConfig,
    getDatabaseConfig,
  };
}

//  End Message Processing Code
//  //////////////////////////////////////////////////////////////////////////////////////////

//  //////////////////////////////////////////////////////////////////////////////////////////
//  Main Function

module.exports = {
  //  Expose these functions to be called by Google Cloud Function.

  main: (event) => {
    //  Create a wrapper and serve the PubSub event.
    let wrapper = wrap();
    return wrapper.serveQueue(event)
      //  Dispose the wrapper and all resources inside.
      .then((result) => { wrapper = null; return result; })
      //  Suppress the error or Google Cloud will call the function again.
      .catch((error) => { wrapper = null; return error; });
  },

  //  For unit test only.
  task: wrap().task,
  createTable: wrap().createTable,
  getMetadataConfig: wrap().getMetadataConfig,
  getDatabaseConfig: wrap().getDatabaseConfig,
  metadataPrefix,
  metadataKeys,
};
